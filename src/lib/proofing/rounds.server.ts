import { query, getDbPool } from "../db/pool.server.ts";
import { getAuthenticatedActor } from "../preparation/preparation.server.ts";

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
  cookieHeader?: string | null,
): Promise<{ proofId: string; roundNumber: number; officialRoundNumber: number }> {
  const actor = await getAuthenticatedActor(cookieHeader);
  const pool = getDbPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN;");

    // 1. Lock the yearbook row to serialize official proof creations
    await client.query(`SELECT id FROM public.yearbooks WHERE id = $1 FOR UPDATE`, [
      params.yearbookId,
    ]);

    // 2. Compute next technical round number
    const roundNumRes = await client.query(
      `SELECT COALESCE(MAX(round_number), 0) + 1 as next_round
       FROM public.proofs
       WHERE yearbook_id = $1`,
      [params.yearbookId],
    );
    const nextRound = parseInt(roundNumRes.rows[0].next_round, 10);

    // 3. Compute next official round number
    const offRes = await client.query(
      `SELECT COALESCE(MAX(official_round_number), 0) + 1 as next_official
       FROM public.proofs
       WHERE yearbook_id = $1 AND round_classification = 'official_master'`,
      [params.yearbookId],
    );
    const nextOfficial = parseInt(offRes.rows[0].next_official, 10);
    const roundName = params.roundName || `Proofreading Round ${nextRound} (Proof ${nextOfficial})`;

    // 4. Insert new proof round unconditionally as official_master
    const proofRes = await client.query(
      `INSERT INTO public.proofs
       (yearbook_id, round_number, official_round_number, round_classification, round_name, proof_version_status, file_path, checksum_sha256, canva_export_id, created_by, generated_by, generated_at)
       VALUES ($1, $2, $3, 'official_master', $4, 'open_for_review', $5, $6, $7, $8, $8, now())
       RETURNING id`,
      [
        params.yearbookId,
        nextRound,
        nextOfficial,
        roundName,
        params.filePath,
        params.checksumSha256,
        params.canvaExportJobId || null,
        actor.id,
      ],
    );
    const proofId = proofRes.rows[0].id;

    // 5. Link all pages of the yearbook to this proof round
    const pagesRes = await client.query(
      `SELECT id, physical_index
       FROM public.pages
       WHERE yearbook_id = $1
       ORDER BY physical_index ASC`,
      [params.yearbookId],
    );

    for (const p of pagesRes.rows) {
      await client.query(
        `INSERT INTO public.proof_pages (proof_id, page_id, yearbook_id, page_number, status)
         VALUES ($1, $2, $3, $4, 'awaiting_review')`,
        [proofId, p.id, params.yearbookId, p.physical_index],
      );
    }

    // 3. If previous round exists, carry forward unresolved corrections
    if (nextRound > 1) {
      const prevProofRes = await client.query(
        `SELECT id FROM public.proofs
         WHERE yearbook_id = $1 AND round_number = $2`,
        [params.yearbookId, nextRound - 1],
      );

      if (prevProofRes.rows.length > 0) {
        const prevProofId = prevProofRes.rows[0].id;
        const openCorrectionsRes = await client.query(
          `SELECT id, page_id, severity, title, description, x_percent, y_percent, width_percent, height_percent, assigned_to
           FROM public.corrections
           WHERE proof_id = $1 AND status NOT IN ('resolved')`,
          [prevProofId],
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
            ],
          );
        }
      }
    }

    await client.query("COMMIT;");
    return { proofId, roundNumber: nextRound, officialRoundNumber: nextOfficial };
  } catch (err) {
    await client.query("ROLLBACK;");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Locks an active proof round and activates database immutability triggers (Super Admin only).
 */
export async function lockProofRound(
  params: {
    proofId: string;
    lockNotes?: string;
  },
  cookieHeader?: string | null,
): Promise<void> {
  const actor = await getAuthenticatedActor(cookieHeader);

  // Super Admin check
  const saCheck = await query(
    `SELECT 1 FROM public.user_roles WHERE user_id = $1 AND role = 'super_admin'`,
    [actor.id],
  );
  if (saCheck.rows.length === 0) {
    const err = new Error("FORBIDDEN: Only Super Administrators can lock official proof rounds.");
    (err as Error & { statusCode?: number }).statusCode = 403;
    throw err;
  }

  await query(
    `UPDATE public.proofs
     SET proof_version_status = 'locked',
         locked_at = now(),
         locked_by = $1,
         lock_notes = $2
     WHERE id = $3 AND proof_version_status IN ('open_for_review', 'corrections_in_progress', 'ready_to_lock')`,
    [actor.id, params.lockNotes || null, params.proofId],
  );
}

/**
 * Coordinator approves a reviewer correction and marks it as an actionable Canva Implementation Task.
 */
export async function coordinatorApproveCorrection(
  params: {
    correctionId: string;
    canvaTaskNotes?: string;
  },
  cookieHeader?: string | null,
): Promise<void> {
  const actor = await getAuthenticatedActor(cookieHeader);

  const corrRes = await query(
    `SELECT c.id, c.proof_id, c.yearbook_id, y.school_id as center_id
     FROM public.corrections c
     JOIN public.yearbooks y ON y.id = c.yearbook_id
     WHERE c.id = $1`,
    [params.correctionId],
  );
  if (corrRes.rows.length === 0) throw new Error("NOT_FOUND: Correction not found");

  const { yearbook_id, center_id } = corrRes.rows[0];

  const isSA = await query(
    `SELECT 1 FROM public.user_roles WHERE user_id = $1 AND role = 'super_admin'`,
    [actor.id],
  );
  const isCoord = await query(
    `SELECT 1 FROM public.center_role_appointments
     WHERE user_id = $1 AND center_id = $2 AND is_active = true AND role = 'coordinator'
     UNION
     SELECT 1 FROM public.yearbook_members
     WHERE user_id = $1 AND yearbook_id = $3 AND role = 'coordinator'`,
    [actor.id, center_id, yearbook_id],
  );

  if (isSA.rows.length === 0 && isCoord.rows.length === 0) {
    const err = new Error(
      "FORBIDDEN: Only the Coordinator or Super Admin can approve corrections into Canva implementation tasks.",
    );
    (err as Error & { statusCode?: number }).statusCode = 403;
    throw err;
  }

  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN;");

    // Fetch correction details with proof state
    const detailRes = await client.query(
      `SELECT c.id, c.proof_id, c.yearbook_id, c.page_id, c.page_number, p.proof_version_status
       FROM public.corrections c
       JOIN public.proofs p ON p.id = c.proof_id
       WHERE c.id = $1 FOR UPDATE`,
      [params.correctionId],
    );

    if (detailRes.rows.length === 0) throw new Error("NOT_FOUND: Correction not found");
    const {
      id: corrId,
      proof_id,
      yearbook_id,
      page_id,
      page_number,
      proof_version_status,
    } = detailRes.rows[0];

    // Check if task already exists for this correction
    const existingTask = await client.query(
      `SELECT id, task_status FROM public.canva_implementation_tasks WHERE correction_id = $1`,
      [corrId],
    );

    let taskId: string;
    if (existingTask.rows.length > 0) {
      taskId = existingTask.rows[0].id;
      await client.query(
        `UPDATE public.canva_implementation_tasks
         SET designer_notes = COALESCE($1, designer_notes),
             updated_at = now()
         WHERE id = $2`,
        [params.canvaTaskNotes || null, taskId],
      );
    } else {
      const insRes = await client.query(
        `INSERT INTO public.canva_implementation_tasks
         (yearbook_id, proof_id, correction_id, page_id, page_number, task_status, designer_notes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'approved_pending_application', $6, now(), now())
         RETURNING id`,
        [yearbook_id, proof_id, corrId, page_id, page_number, params.canvaTaskNotes || null],
      );
      taskId = insRes.rows[0].id;
    }

    // Append-only event log
    await client.query(
      `INSERT INTO public.canva_implementation_task_events
       (task_id, yearbook_id, actor_id, event_type, previous_status, new_status, notes)
       VALUES ($1, $2, $3, 'created', NULL, 'approved_pending_application', $4)`,
      [taskId, yearbook_id, actor.id, params.canvaTaskNotes || "Coordinator approved correction"],
    );

    // If source proof is still open/editable, update status in corrections table as well
    if (
      proof_version_status === "open_for_review" ||
      proof_version_status === "corrections_in_progress"
    ) {
      await client.query(
        `UPDATE public.corrections
         SET status = 'acknowledged',
             correction_status = 'acknowledged',
             description = CASE WHEN $2::text IS NOT NULL THEN description || E'\n[Canva Task]: ' || $2 ELSE description END,
             updated_at = now()
         WHERE id = $1`,
        [corrId, params.canvaTaskNotes || null],
      );
    }

    await client.query("COMMIT;");
  } catch (err) {
    await client.query("ROLLBACK;");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Super Admin updates a Canva Implementation Task (e.g. in_progress, applied_in_canva, verified, rejected).
 * Strictly requires Super Administrator role.
 */
export async function updateCanvaImplementationTask(
  params: {
    taskId: string;
    taskStatus?:
      | "approved_pending_application"
      | "in_progress"
      | "applied_in_canva"
      | "rejected"
      | "verified"
      | undefined;
    designerNotes?: string | undefined;
    canvaElementId?: string | undefined;
    canvaPageId?: string | undefined;
  },
  cookieHeader?: string | null,
): Promise<{ taskId: string; taskStatus: string }> {
  const actor = await getAuthenticatedActor(cookieHeader);

  // Super Admin check
  const saCheck = await query(
    `SELECT 1 FROM public.user_roles WHERE user_id = $1 AND role = 'super_admin'`,
    [actor.id],
  );
  if (saCheck.rows.length === 0) {
    const err = new Error(
      "FORBIDDEN: Only Super Administrators can update Canva implementation task execution status.",
    );
    (err as Error & { statusCode?: number }).statusCode = 403;
    throw err;
  }

  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN;");

    const taskRes = await client.query(
      `SELECT id, yearbook_id, proof_id, correction_id, task_status
       FROM public.canva_implementation_tasks
       WHERE id = $1 FOR UPDATE`,
      [params.taskId],
    );
    if (taskRes.rows.length === 0) {
      throw new Error("NOT_FOUND: Canva implementation task not found");
    }

    const { yearbook_id, task_status: prevStatus } = taskRes.rows[0];
    const newStatus = params.taskStatus || prevStatus;

    const isApplied = newStatus === "applied_in_canva";
    const isVerified = newStatus === "verified";

    await client.query(
      `UPDATE public.canva_implementation_tasks
       SET task_status = $1,
           designer_notes = COALESCE($2, designer_notes),
           canva_element_id = COALESCE($3, canva_element_id),
           canva_page_id = COALESCE($4, canva_page_id),
           assigned_designer_id = $5,
           applied_at = CASE WHEN $6 = true THEN COALESCE(applied_at, now()) ELSE applied_at END,
           verified_at = CASE WHEN $7 = true THEN COALESCE(verified_at, now()) ELSE verified_at END,
           updated_at = now()
       WHERE id = $8`,
      [
        newStatus,
        params.designerNotes || null,
        params.canvaElementId || null,
        params.canvaPageId || null,
        actor.id,
        isApplied,
        isVerified,
        params.taskId,
      ],
    );

    // Record audit event
    await client.query(
      `INSERT INTO public.canva_implementation_task_events
       (task_id, yearbook_id, actor_id, event_type, previous_status, new_status, notes)
       VALUES ($1, $2, $3, 'status_change', $4, $5, $6)`,
      [params.taskId, yearbook_id, actor.id, prevStatus, newStatus, params.designerNotes || null],
    );

    await client.query("COMMIT;");
    return { taskId: params.taskId, taskStatus: newStatus };
  } catch (err) {
    await client.query("ROLLBACK;");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Lists Canva Implementation Tasks for a proof or yearbook with event history.
 */
export async function getCanvaImplementationTasks(
  params: {
    yearbookId?: string | undefined;
    proofId?: string | undefined;
  },
  cookieHeader?: string | null,
): Promise<
  Array<{
    id: string;
    yearbookId: string;
    proofId: string;
    correctionId: string;
    pageId: string | null;
    pageNumber: number | null;
    taskStatus: string;
    designerNotes: string | null;
    canvaElementId: string | null;
    canvaPageId: string | null;
    createdAt: string;
    updatedAt: string;
    appliedAt: string | null;
    verifiedAt: string | null;
    correctionTitle?: string;
  }>
> {
  await getAuthenticatedActor(cookieHeader);

  let whereClause = "WHERE 1=1";
  const queryParams: unknown[] = [];
  if (params.yearbookId) {
    queryParams.push(params.yearbookId);
    whereClause += ` AND t.yearbook_id = $${queryParams.length}`;
  }
  if (params.proofId) {
    queryParams.push(params.proofId);
    whereClause += ` AND t.proof_id = $${queryParams.length}`;
  }

  const res = await query(
    `SELECT t.*, c.title as correction_title
     FROM public.canva_implementation_tasks t
     LEFT JOIN public.corrections c ON c.id = t.correction_id
     ${whereClause}
     ORDER BY t.created_at DESC`,
    queryParams,
  );

  return res.rows.map((r) => ({
    id: r.id,
    yearbookId: r.yearbook_id,
    proofId: r.proof_id,
    correctionId: r.correction_id,
    pageId: r.page_id,
    pageNumber: r.page_number,
    taskStatus: r.task_status,
    designerNotes: r.designer_notes,
    canvaElementId: r.canva_element_id,
    canvaPageId: r.canva_page_id,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
    appliedAt: r.applied_at ? r.applied_at.toISOString() : null,
    verifiedAt: r.verified_at ? r.verified_at.toISOString() : null,
    correctionTitle: r.correction_title || "Proof Correction",
  }));
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
  cookieHeader?: string | null,
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
      [params.proofId, actor.id],
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
      [assignmentId, params.proofId, params.pageId, yearbook_id, actor.id, params.notes || null],
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
  cookieHeader?: string | null,
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
      [params.proofId],
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
      [params.proofId, actor.id],
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
      ],
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
 * NOTE: Records an escalation audit log only—it will NOT authorize production release
 * or bypass the four mandatory final approvals.
 */
export async function emergencyReleaseOverride(
  params: {
    proofId: string;
    writtenJustification: string;
  },
  cookieHeader?: string | null,
): Promise<void> {
  const actor = await getAuthenticatedActor(cookieHeader);
  const saCheck = await query(
    `SELECT 1 FROM public.user_roles WHERE user_id = $1 AND role = 'super_admin'`,
    [actor.id],
  );
  if (saCheck.rows.length === 0) {
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
      [params.proofId],
    );

    if (proofRes.rows.length === 0) {
      throw new Error("NOT_FOUND: Proof round not found");
    }
    const { yearbook_id, checksum_sha256 } = proofRes.rows[0];

    // Record emergency override audit log (Escalation only)
    await client.query(
      `INSERT INTO public.production_release_overrides
       (yearbook_id, proof_id, pdf_checksum_sha256, authorized_by_super_admin_id, written_justification, created_at)
       VALUES ($1, $2, $3, $4, $5, now())`,
      [yearbook_id, params.proofId, checksum_sha256, actor.id, params.writtenJustification.trim()],
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
 * Retrieves the full 4-Signatory Governance status for a candidate proof round.
 */
export async function getProofSignoffStatus(
  proofId: string,
  cookieHeader?: string | null,
): Promise<{
  proofId: string;
  yearbookId: string;
  checksumSha256: string;
  proofVersionStatus: string;
  isAllApproved: boolean;
  signatories: Array<{
    requirementId: string;
    role: "editor_in_chief" | "coordinator" | "principal" | "school_director";
    designatedUserId: string;
    signatoryName: string;
    signatoryEmail: string;
    decision: "approved" | "approved_with_notes" | "changes_requested" | "pending";
    decidedAt: string | null;
    notes: string | null;
  }>;
}> {
  await getAuthenticatedActor(cookieHeader);

  const proofRes = await query(
    `SELECT id, yearbook_id, checksum_sha256, proof_version_status
     FROM public.proofs WHERE id = $1`,
    [proofId],
  );
  if (proofRes.rows.length === 0) {
    throw new Error("NOT_FOUND: Proof round not found");
  }
  const proof = proofRes.rows[0];

  const sigRes = await query(
    `SELECT
       r.id as requirement_id,
       r.signatory_role,
       r.designated_user_id,
       u.full_name as signatory_name,
       u.email as signatory_email,
       d.decision,
       d.decided_at,
       d.notes
     FROM public.proof_signoff_requirements r
     JOIN public.users u ON u.id = r.designated_user_id
     LEFT JOIN public.proof_signoff_decisions d
       ON d.requirement_id = r.id AND d.pdf_checksum_sha256 = $2
     WHERE r.proof_id = $1 AND r.is_active = true
     ORDER BY r.assigned_at ASC`,
    [proofId, proof.checksum_sha256],
  );

  const signatories = sigRes.rows.map((s) => ({
    requirementId: s.requirement_id,
    role: s.signatory_role as "editor_in_chief" | "coordinator" | "principal" | "school_director",
    designatedUserId: s.designated_user_id,
    signatoryName: s.signatory_name || "Designated Signatory",
    signatoryEmail: s.signatory_email || "",
    decision: (s.decision || "pending") as
      "pending" | "approved" | "approved_with_notes" | "changes_requested",
    decidedAt: s.decided_at ? new Date(s.decided_at).toISOString() : null,
    notes: s.notes || null,
  }));

  const mandatoryRoles = ["editor_in_chief", "coordinator", "principal", "school_director"];
  const approvedRoles = signatories
    .filter((s) => s.decision === "approved" || s.decision === "approved_with_notes")
    .map((s) => s.role);

  const isAllApproved = mandatoryRoles.every((r) =>
    approvedRoles.includes(
      r as "editor_in_chief" | "coordinator" | "principal" | "school_director",
    ),
  );

  return {
    proofId,
    yearbookId: proof.yearbook_id,
    checksumSha256: proof.checksum_sha256,
    proofVersionStatus: proof.proof_version_status,
    isAllApproved,
    signatories,
  };
}
