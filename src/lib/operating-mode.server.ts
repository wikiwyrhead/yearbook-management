import { getDbPool, query } from "./db/pool.server.ts";
import type { PlatformOperatingMode } from "./db/schema.ts";

export interface PlatformOperatingContext {
  operatingMode: PlatformOperatingMode;
  primaryCenterId: string | null;
  primaryCenterName: string | null;
  changedBy: string | null;
  changedAt: string;
}

/**
 * Reads fresh platform operating settings from PostgreSQL.
 * Fresh per request (zero stale process-memory caching).
 */
export async function getPlatformOperatingContext(): Promise<PlatformOperatingContext> {
  const res = await query(
    `SELECT ps.operating_mode, ps.primary_center_id, ps.changed_by, ps.changed_at, s.name as primary_center_name
     FROM public.platform_settings ps
     LEFT JOIN public.schools s ON s.id = ps.primary_center_id
     WHERE ps.id = 'global'
     LIMIT 1`
  );

  const row = res.rows[0];
  if (!row) {
    return {
      operatingMode: "multi_center",
      primaryCenterId: null,
      primaryCenterName: null,
      changedBy: null,
      changedAt: new Date().toISOString(),
    };
  }

  return {
    operatingMode: (row.operating_mode as PlatformOperatingMode) || "multi_center",
    primaryCenterId: row.primary_center_id || null,
    primaryCenterName: row.primary_center_name || null,
    changedBy: row.changed_by || null,
    changedAt: row.changed_at ? new Date(row.changed_at).toISOString() : new Date().toISOString(),
  };
}

/**
 * Asserts that a new Center/School can be created.
 * Rejects with 403 / Error when in single_center mode.
 */
export async function assertCanCreateCenter(context?: PlatformOperatingContext): Promise<void> {
  const ctx = context ?? (await getPlatformOperatingContext());
  if (ctx.operatingMode === "single_center") {
    throw new Error(
      "Center creation is disabled while Single-Center operating mode is enabled. Restore Multiple-Center mode to create additional centers."
    );
  }
}

/**
 * Asserts that a Center is operational.
 * In single_center mode, only the Primary Center is operational.
 */
export async function assertCenterOperational(
  centerId: string,
  context?: PlatformOperatingContext
): Promise<void> {
  if (!centerId) {
    throw new Error("Missing center ID for operational validation.");
  }
  const ctx = context ?? (await getPlatformOperatingContext());
  if (ctx.operatingMode === "single_center") {
    if (!ctx.primaryCenterId || ctx.primaryCenterId !== centerId) {
      throw new Error(
        "Access Denied: This Center is not operational while Single-Center operating mode is enabled."
      );
    }
  }
}

/**
 * Asserts that a Yearbook is operational by verifying its parent Center.
 */
export async function assertYearbookOperational(
  yearbookId: string,
  context?: PlatformOperatingContext
): Promise<void> {
  if (!yearbookId) {
    throw new Error("Missing yearbook ID for operational validation.");
  }
  const ctx = context ?? (await getPlatformOperatingContext());
  if (ctx.operatingMode === "multi_center") {
    return;
  }

  const res = await query(
    `SELECT school_id FROM public.yearbooks WHERE id = $1 LIMIT 1`,
    [yearbookId]
  );
  const row = res.rows[0];
  if (!row) {
    throw new Error("Yearbook not found.");
  }

  await assertCenterOperational(row.school_id, ctx);
}

/**
 * Updates platform operating mode transactionally with row-level locking.
 * Strictly checks that primary_center_id exists and is active when selecting single_center.
 * Records immutable historical snapshot with both previous and new primary centers.
 */
export async function updatePlatformOperatingMode(params: {
  operatingMode: PlatformOperatingMode;
  primaryCenterId?: string | null;
  userId: string;
}): Promise<PlatformOperatingContext> {
  const { operatingMode, primaryCenterId, userId } = params;

  if (operatingMode === "single_center" && !primaryCenterId) {
    throw new Error("A valid Primary Center must be selected to enable Single-Center mode.");
  }

  const pool = getDbPool();
  const client = await pool.connect();

  try {
    // 1. Begin transaction
    await client.query("BEGIN");

    // 2. Lock only the singleton settings row
    const currentRes = await client.query(
      `SELECT id, operating_mode, primary_center_id
       FROM public.platform_settings
       WHERE id = 'global'
       FOR UPDATE`
    );

    const currentRow = currentRes.rows[0] || {
      operating_mode: "multi_center",
      primary_center_id: null,
    };

    const prevMode = currentRow.operating_mode;
    const prevCenterId = currentRow.primary_center_id;

    // 3. Retrieve the previous Primary Center name separately, if primary_center_id is not null
    let prevCenterName: string | null = null;
    if (prevCenterId) {
      const prevNameRes = await client.query(
        `SELECT name FROM public.schools WHERE id = $1 LIMIT 1`,
        [prevCenterId]
      );
      prevCenterName = prevNameRes.rows[0]?.name || null;
    }

    // 4. When enabling Single-Center Mode, validate and lock the requested Center directly
    let targetCenterId: string | null = null;
    let targetCenterName: string | null = null;

    if (operatingMode === "single_center") {
      const schoolRes = await client.query(
        `SELECT id, name, is_active
         FROM public.schools
         WHERE id = $1 AND is_active = true
         FOR SHARE`,
        [primaryCenterId]
      );
      const school = schoolRes.rows[0];
      if (!school) {
        throw new Error(
          "Selected Primary Center does not exist or is inactive. A valid active Center is required for Single-Center mode."
        );
      }
      targetCenterId = school.id;
      targetCenterName = school.name;
    }

    // 5. Check if there is an actual change (idempotency check)
    const isModeChanged = prevMode !== operatingMode;
    const isCenterChanged = prevCenterId !== targetCenterId;

    if (isModeChanged || isCenterChanged) {
      // 6. Update platform_settings
      await client.query(
        `UPDATE public.platform_settings
         SET operating_mode = $1,
             primary_center_id = $2,
             changed_by = $3,
             changed_at = now()
         WHERE id = 'global'`,
        [operatingMode, targetCenterId, userId]
      );

      // 7. Insert the immutable history record using the previous and new mode/Center snapshots
      await client.query(
        `INSERT INTO public.platform_settings_history
         (previous_operating_mode, new_operating_mode, previous_primary_center_id, previous_primary_center_name, new_primary_center_id, new_primary_center_name, changed_by, changed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, now())`,
        [
          prevMode,
          operatingMode,
          prevCenterId,
          prevCenterName,
          targetCenterId,
          targetCenterName,
          userId,
        ]
      );
    }

    // 8. Commit
    await client.query("COMMIT");

    return {
      operatingMode,
      primaryCenterId: targetCenterId ?? null,
      primaryCenterName: targetCenterName,
      changedBy: userId,
      changedAt: new Date().toISOString(),
    };
  } catch (err) {
    // 9. Roll back the entire transaction on any error
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
