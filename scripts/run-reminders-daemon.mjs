/**
 * Milestone Yearbook — Background Signoff Reminder Daemon
 * Runs periodically with advisory locking, rolling 24-hour deduplication, and signal handling.
 */
import pg from "pg";
const { Pool } = pg;

const DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://yearbook_user:yearbook_pass@postgres:5432/yearbook_db";
const INTERVAL_SECONDS = parseInt(process.env.REMINDER_INTERVAL_SECONDS || "3600", 10);
const ADVISORY_LOCK_ID = 88442211;

const pool = new Pool({ connectionString: DATABASE_URL });

let isRunning = true;

async function runReminderCycle() {
  const client = await pool.connect();
  let acquiredLock = false;

  try {
    const lockRes = await client.query("SELECT pg_try_advisory_lock($1) as acquired", [
      ADVISORY_LOCK_ID,
    ]);
    acquiredLock = lockRes.rows[0]?.acquired === true;

    if (!acquiredLock) {
      console.log(
        `[${new Date().toISOString()}] [ReminderDaemon] Lock ${ADVISORY_LOCK_ID} busy. Skipping cycle.`,
      );
      return;
    }

    console.log(
      `[${new Date().toISOString()}] [ReminderDaemon] Acquired advisory lock ${ADVISORY_LOCK_ID}. Scanning pending signoffs...`,
    );

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
        AND NOT EXISTS (
          SELECT 1 FROM public.proof_signoff_decisions d
          WHERE d.requirement_id = r.id 
            AND d.pdf_checksum_sha256 = p.checksum_sha256
            AND d.decision IN ('approved', 'approved_with_notes')
        )
        AND (sn.last_sent_at IS NULL OR sn.last_sent_at < NOW() - INTERVAL '24 hours')
    `);

    let dispatched = 0;
    for (const item of pendingRes.rows) {
      const dedupKey = `signoff_remind_${item.proof_id}_${item.designated_user_id}`;
      await client.query(
        `
        INSERT INTO public.signoff_notifications 
        (yearbook_id, proof_id, recipient_user_id, recipient_role, notification_type, dedup_key, last_sent_at)
        VALUES ($1, $2, $3, $4, 'signoff_pending', $5, now())
        ON CONFLICT (dedup_key) 
        DO UPDATE SET last_sent_at = now();
      `,
        [item.yearbook_id, item.proof_id, item.designated_user_id, item.signatory_role, dedupKey],
      );

      await client.query(
        `
        INSERT INTO public.production_audit_log 
        (yearbook_id, action, entity_type, entity_id, user_id, metadata, created_at)
        VALUES ($1, 'signoff_reminder_dispatched', 'proof_signoff_requirement', $2, $3, $4, now())
      `,
        [
          item.yearbook_id,
          item.requirement_id,
          item.designated_user_id,
          JSON.stringify({
            recipient_email: item.email,
            signatory_role: item.signatory_role,
            round_name: item.round_name,
            timestamp: new Date().toISOString(),
          }),
        ],
      );

      dispatched++;
    }

    console.log(
      `[${new Date().toISOString()}] [ReminderDaemon] Cycle completed: ${dispatched} reminder(s) dispatched.`,
    );
  } catch (err) {
    console.error(
      `[${new Date().toISOString()}] [ReminderDaemon] Error during reminder cycle:`,
      err,
    );
  } finally {
    if (acquiredLock) {
      try {
        await client.query("SELECT pg_advisory_unlock($1)", [ADVISORY_LOCK_ID]);
      } catch {}
    }
    client.release();
  }
}

async function main() {
  console.log(
    `[${new Date().toISOString()}] [ReminderDaemon] Starting reminder worker (interval: ${INTERVAL_SECONDS}s)...`,
  );

  // Run initial cycle immediately
  await runReminderCycle();

  const timer = setInterval(async () => {
    if (!isRunning) return;
    await runReminderCycle();
  }, INTERVAL_SECONDS * 1000);

  const shutdown = async (signal) => {
    console.log(
      `\n[${new Date().toISOString()}] [ReminderDaemon] Received ${signal}. Shutting down gracefully...`,
    );
    isRunning = false;
    clearInterval(timer);
    await pool.end();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("Fatal daemon error:", err);
  process.exit(1);
});
