import { query, getDbPool } from "../db/pool.server";
import { getAuthenticatedActor } from "../preparation/preparation.server";

export interface ProofRoundSummaryDTO {
  id: string;
  yearbook_id: string;
  round_number: number;
  round_name: string;
  proof_version_status: string;
  file_path: string;
  checksum_sha256: string;
  canva_export_job_id: string | null;
  generated_by: string;
  generated_at: string;
  locked_at: string | null;
  locked_by: string | null;
  lock_notes: string | null;
  total_pages: number;
  open_corrections_count: number;
  pending_signatories_count: number;
}

/**
 * Creates a new Proof Round (Round N) and carries forward unresolved corrections from prior round.
 */
export async function createProofRound(
  params: {
    yearbookId: string;
    roundName?: string;
    filePath: string;
    checksumSha256: string;
    canvaExportJobId?: string;
  },
  cookieHeader?: string | null
): Promise<{ proofId: string; roundNumber: number }> {
  const actor = await getAuthenticatedActor(cookieHeader);
  const pool = getDbPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN;");

    // Compute next round number
    const roundNumRes = await client.query(
      `SELECT COALESCE(MAX(round_number), 0) + 1 as next_round
       FROM public.proofs
       WHERE yearbook_id = $1`,
      [params.yearbookId]
    );
    const nextRound = parseInt(roundNumRes.rows[0].next_round, 10);
    const roundName = params.roundName || `Proofreading Round ${nextRound}`;

    // 1. Insert new proof round
    const proofRes = await client.query(
      `INSERT INTO public.proofs 
       (yearbook_id, round_number, round_name, proof_version_status, file_path, checksum_sha256, canva_export_job_id, generated_by, generated_at)
       VALUES ($1, $2, $3, 'open_for_review', $4, $5, $6, $7, now())
       RETURNING id`,
      [
        params.yearbookId,
        nextRound,
        roundName,
        params.filePath,
        params.checksumSha256,
        params.canvaExportJobId || null,
        actor.id,
      ]
    );
    const proofId = proofRes.rows[0].id;

    // 2. Link all pages of the yearbook to this proof round
    const pagesRes = await client.query(
      `SELECT id, physical_index 
       FROM public.pages 
       WHERE yearbook_id = $1 
       ORDER BY physical_index ASC`,
      [params.yearbookId]
    );

    for (const p of pagesRes.rows) {
      await client.query(
        `INSERT INTO public.proof_pages (proof_id, page_id, yearbook_id, page_number, status)
         VALUES ($1, $2, $3, $4, 'awaiting_review')`,
        [proofId, p.id, params.yearbookId, p.physical_index]
      );
    }

    // 3. If previous round exists, carry forward unresolved corrections
    if (nextRound > 1) {
      const prevProofRes = await client.query(
        `SELECT id FROM public.proofs 
         WHERE yearbook_id = $1 AND round_number = $2`,
        [params.yearbookId, nextRound - 1]
      );

      if (prevProofRes.rows.length > 0) {
        const prevProofId = prevProofRes.rows[0].id;
        const openCorrectionsRes = await client.query(
          `SELECT id, page_id, severity, title, description, x_percent, y_percent, width_percent, height_percent, assigned_to
           FROM public.corrections
           WHERE proof_id = $1 AND status NOT IN ('resolved')`,
          [prevProofId]
        );

        for (const corr of openCorrectionsRes.rows) {
          await client.query(
            `INSERT INTO public.corrections 
             (proof_id, page_id, yearbook_id, status, severity, title, description, x_percent, y_percent, width_percent, height_percent, assigned_to, carried_from_id, created_by, created_at)
             VALUES ($1, $2, $3, 'open', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now())`,
            [
              proofId,
              corr.page_id,
              params.yearbookId,
              corr.severity,
              corr.title,
              corr.description,
              corr.x_percent,
              corr.y_percent,
              corr.width_percent,
              corr.height_percent,
              corr.assigned_to,
              corr.id, // carried_from_id links to ancestral origin
              actor.id,
            ]
          );
        }
      }
    }

    await client.query("COMMIT;");
    return { proofId, roundNumber: nextRound };
  } catch (err) {
    await client.query("ROLLBACK;");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Locks an active proof round and activates database immutability triggers.
 */
export async function lockProofRound(
  params: {
    proofId: string;
    lockNotes?: string;
  },
  cookieHeader?: string | null
): Promise<void> {
  const actor = await getAuthenticatedActor(cookieHeader);

  await query(
    `UPDATE public.proofs
     SET proof_version_status = 'locked',
         locked_at = now(),
         locked_by = $1,
         lock_notes = $2,
         updated_at = now()
     WHERE id = $3 AND proof_version_status = 'open_for_review'`,
    [actor.id, params.lockNotes || null, params.proofId]
  );
}

/**
 * Records reviewer completion on a specific page of a proof round.
 */
export async function recordReviewerCompletion(
  params: {
    proofId: string;
    pageId: string;
    notes?: string;
  },
  cookieHeader?: string | null
): Promise<void> {
  const actor = await getAuthenticatedActor(cookieHeader);
  const pool = getDbPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN;");

    // Fetch active assignment for this actor
    const assignRes = await client.query(
      `SELECT id, yearbook_id 
       FROM public.proof_reviewer_assignments
       WHERE proof_id = $1 AND user_id = $2 AND revoked_at IS NULL
       LIMIT 1`,
      [params.proofId, actor.id]
    );

    if (assignRes.rows.length === 0) {
      throw new Error("UNAUTHORIZED: No active reviewer assignment for this proof");
    }

    const { id: assignmentId, yearbook_id } = assignRes.rows[0];

    await client.query(
      `INSERT INTO public.proof_page_reviewer_completions 
       (assignment_id, proof_id, page_id, yearbook_id, user_id, completed_at, notes)
       VALUES ($1, $2, $3, $4, $5, now(), $6)
       ON CONFLICT (proof_id, page_id, user_id) 
       DO UPDATE SET completed_at = now(), notes = EXCLUDED.notes`,
      [assignmentId, params.proofId, params.pageId, yearbook_id, actor.id, params.notes || null]
    );

    await client.query("COMMIT;");
  } catch (err) {
    await client.query("ROLLBACK;");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Submits an append-only governance signoff decision bound to PDF SHA-256 checksum.
 */
export async function submitGovernanceSignoff(
  params: {
    proofId: string;
    decision: "approved" | "approved_with_notes" | "changes_requested";
    notes?: string;
  },
  cookieHeader?: string | null
): Promise<{ decisionId: string }> {
  const actor = await getAuthenticatedActor(cookieHeader);
  const pool = getDbPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN;");

    // Verify proof exists and get active checksum
    const proofRes = await client.query(
      `SELECT id, yearbook_id, checksum_sha256 
       FROM public.proofs 
       WHERE id = $1`,
      [params.proofId]
    );

    if (proofRes.rows.length === 0) {
      throw new Error("NOT_FOUND: Proof round not found");
    }
    const { yearbook_id, checksum_sha256 } = proofRes.rows[0];

    // Find active designated requirement for this actor
    const reqRes = await client.query(
      `SELECT id, signatory_role 
       FROM public.proof_signoff_requirements
       WHERE proof_id = $1 AND designated_user_id = $2 AND is_active = true`,
      [params.proofId, actor.id]
    );

    if (reqRes.rows.length === 0) {
      throw new Error("UNAUTHORIZED: You are not an active designated signatory for this proof");
    }
    const { id: requirementId } = reqRes.rows[0];

    // Insert append-only decision
    const decRes = await client.query(
      `INSERT INTO public.proof_signoff_decisions 
       (requirement_id, proof_id, yearbook_id, pdf_checksum_sha256, user_id, decision, notes, decided_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now())
       RETURNING id`,
      [
        requirementId,
        params.proofId,
        yearbook_id,
        checksum_sha256,
        actor.id,
        params.decision,
        params.notes || null,
      ]
    );

    await client.query("COMMIT;");
    return { decisionId: decRes.rows[0].id };
  } catch (err) {
    await client.query("ROLLBACK;");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Super Admin emergency release override with mandatory written justification.
 */
export async function emergencyReleaseOverride(
  params: {
    proofId: string;
    writtenJustification: string;
  },
  cookieHeader?: string | null
): Promise<void> {
  const actor = await getAuthenticatedActor(cookieHeader);
  if (!actor.roles.includes("super_admin")) {
    throw new Error("FORBIDDEN: Only Super Admin can authorize an emergency release override");
  }

  if (!params.writtenJustification || params.writtenJustification.trim().length < 25) {
    throw new Error("VALIDATION_ERROR: Written justification must be at least 25 characters");
  }

  const pool = getDbPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN;");

    const proofRes = await client.query(
      `SELECT id, yearbook_id, checksum_sha256 
       FROM public.proofs 
       WHERE id = $1 FOR UPDATE`,
      [params.proofId]
    );

    if (proofRes.rows.length === 0) {
      throw new Error("NOT_FOUND: Proof round not found");
    }
    const { yearbook_id, checksum_sha256 } = proofRes.rows[0];

    // Record emergency override audit log
    await client.query(
      `INSERT INTO public.production_release_overrides
       (yearbook_id, proof_id, pdf_checksum_sha256, authorized_by_super_admin_id, written_justification, created_at)
       VALUES ($1, $2, $3, $4, $5, now())`,
      [yearbook_id, params.proofId, checksum_sha256, actor.id, params.writtenJustification.trim()]
    );

    // Update status to released_for_production
    await client.query(
      `UPDATE public.proofs
       SET proof_version_status = 'released_for_production',
           updated_at = now()
       WHERE id = $1`,
      [params.proofId]
    );

    await client.query("COMMIT;");
  } catch (err) {
    await client.query("ROLLBACK;");
    throw err;
  } finally {
    client.release();
  }
}
