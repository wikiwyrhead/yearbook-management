import { getDbPool } from "../db/pool.server";

const ADVISORY_LOCK_ID = 88442211;

export interface ReminderJobResult {
  dispatched: number;
  skipped: number;
  errors: number;
}

/**
 * Background worker task that checks for pending governance signoffs
 * and dispatches notifications with rolling 24-hour deduplication and advisory locks.
 */
export async function executeSignoffRemindersJob(): Promise<ReminderJobResult> {
  const pool = getDbPool();
  const client = await pool.connect();
  let acquiredLock = false;

  const result: ReminderJobResult = { dispatched: 0, skipped: 0, errors: 0 };

  try {
    // 1. Try PostgreSQL Advisory Lock (Mutual Exclusion across containers)
    const lockRes = await client.query(
      `SELECT pg_try_advisory_lock($1) as acquired`,
      [ADVISORY_LOCK_ID]
    );

    acquiredLock = lockRes.rows[0]?.acquired === true;
    if (!acquiredLock) {
      // Another worker is running the reminder cycle
      return result;
    }

    // 2. Query pending signoff requirements on active final candidate rounds
    const pendingRes = await client.query(`
      SELECT 
        r.id as requirement_id,
        r.proof_id,
        r.yearbook_id,
        r.signatory_role,
        r.designated_user_id,
        u.email,
        u.full_name,
        p.round_name,
        p.checksum_sha256,
        s.name as school_name,
        y.title as yearbook_title,
        sn.last_sent_at
      FROM public.proof_signoff_requirements r
      JOIN public.proofs p ON p.id = r.proof_id
      JOIN public.yearbooks y ON y.id = r.yearbook_id
      JOIN public.schools s ON s.id = y.school_id
      JOIN public.users u ON u.id = r.designated_user_id
      LEFT JOIN public.signoff_notifications sn ON sn.proof_id = r.proof_id AND sn.recipient_user_id = r.designated_user_id
      WHERE r.is_active = true
        AND p.proof_version_status IN ('final_candidate', 'open_for_review')
        -- Filter out requirements that already have an 'approved' decision for current checksum
        AND NOT EXISTS (
          SELECT 1 FROM public.proof_signoff_decisions d
          WHERE d.requirement_id = r.id 
            AND d.pdf_checksum_sha256 = p.checksum_sha256
            AND d.decision IN ('approved', 'approved_with_notes')
        )
        -- Rolling 24-hour deduplication constraint
        AND (sn.last_sent_at IS NULL OR sn.last_sent_at < NOW() - INTERVAL '24 hours')
    `);

    for (const item of pendingRes.rows) {
      try {
        const dedupKey = `signoff_remind_${item.proof_id}_${item.designated_user_id}`;

        // Upsert notification record
        await client.query(`
          INSERT INTO public.signoff_notifications 
          (yearbook_id, proof_id, recipient_user_id, recipient_role, notification_type, dedup_key, last_sent_at)
          VALUES ($1, $2, $3, $4, 'signoff_pending', $5, now())
          ON CONFLICT (dedup_key) 
          DO UPDATE SET last_sent_at = now();
        `, [item.yearbook_id, item.proof_id, item.designated_user_id, item.signatory_role, dedupKey]);

        // Insert audit log event
        await client.query(`
          INSERT INTO public.production_audit_log 
          (yearbook_id, action, entity_type, entity_id, user_id, metadata, created_at)
          VALUES ($1, 'signoff_reminder_dispatched', 'proof_signoff_requirement', $2, $3, $4, now())
        `, [
          item.yearbook_id,
          item.requirement_id,
          item.designated_user_id,
          JSON.stringify({
            recipient_email: item.email,
            signatory_role: item.signatory_role,
            round_name: item.round_name,
            timestamp: new Date().toISOString(),
          }),
        ]);

        result.dispatched++;
      } catch (itemErr) {
        console.error("[RemindersWorker] Failed to dispatch reminder for item:", item.requirement_id, itemErr);
        result.errors++;
      }
    }

  } catch (err) {
    console.error("[RemindersWorker] Error during reminder cycle execution:", err);
    result.errors++;
  } finally {
    if (acquiredLock) {
      await client.query(`SELECT pg_advisory_unlock($1)`, [ADVISORY_LOCK_ID]).catch(() => {});
    }
    client.release();
  }

  return result;
}
