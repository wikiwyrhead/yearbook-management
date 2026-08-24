import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertYearbookOperational } from "@/lib/operating-mode.server";

/**
 * Retrieves the full preparation packet for a specific page.
 */
export const getPagePreparationPacketFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ pageId: z.string() }))
  .handler(async ({ data, context }) => {
    const { getPagePreparationPacket } = await import("./preparation/preparation.server");
    return await getPagePreparationPacket(data.pageId, context.userId);
  });

/**
 * Updates textual and metadata properties of a page preparation packet.
 * Strictly checks that actor is an assigned editorial member, coordinator, or super admin.
 */
export const updatePagePreparationPacketFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      pageId: z.string(),
      updates: z.object({
        title: z.string().optional(),
        captions_and_credits: z.string().optional(),
        prep_status: z.string().optional(),
      }),
    }),
  )
  .handler(async ({ data, context }) => {
    const { updatePagePreparationPacket } = await import("./preparation/preparation.server");
    return await updatePagePreparationPacket(
      data.pageId,
      {
        ...(data.updates.title !== undefined ? { title: data.updates.title } : {}),
        ...(data.updates.captions_and_credits !== undefined
          ? { captions_and_credits: data.updates.captions_and_credits }
          : {}),
        ...(data.updates.prep_status !== undefined
          ? { prep_status: data.updates.prep_status }
          : {}),
      },
      context.userId,
    );
  });

/**
 * Records a multi-stage review decision for a page or section.
 */
export const signOffPreparationStageFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      yearbookId: z.string(),
      pageId: z.string().optional().nullable(),
      sectionId: z.string().optional().nullable(),
      scope: z.enum(["page", "section", "edition"]),
      stage: z.enum([
        "editorial_member",
        "editor_in_chief",
        "coordinator",
        "principal",
        "school_director",
        "super_admin",
      ]),
      decision: z.enum(["approved", "changes_requested"]),
      notes: z.string().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    await assertYearbookOperational(data.yearbookId);
    const { signOffPreparationStage } = await import("./preparation/preparation.server");
    return await signOffPreparationStage(
      {
        yearbookId: data.yearbookId,
        pageId: data.pageId ?? null,
        sectionId: data.sectionId ?? null,
        scope: data.scope,
        stage: data.stage,
        decision: data.decision,
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
      },
      context.userId,
    );
  });

/**
 * Creates an immutable Design Packet Snapshot with canonical SHA-256 hash.
 */
export const createDesignPacketSnapshotFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ pageId: z.string() }))
  .handler(async ({ data, context }) => {
    const { createDesignPacketSnapshot } = await import("./preparation/preparation.server");
    return await createDesignPacketSnapshot(data.pageId, context.userId);
  });

/**
 * Records an append-only review decision for a design packet snapshot.
 */
export const recordDesignPacketReviewFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      snapshotId: z.string(),
      stage: z.enum(["eic_review", "coordinator_approval", "super_admin_check"]),
      decision: z.enum(["approved", "changes_requested", "rejected"]),
      notes: z.string().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { recordDesignPacketReview } = await import("./preparation/preparation.server");
    return await recordDesignPacketReview(
      {
        snapshotId: data.snapshotId,
        stage: data.stage,
        decision: data.decision,
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
      },
      context.userId,
    );
  });

/**
 * Retrieves the complete preparation book map overview.
 */
export const getYearbookPreparationBookMapFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ yearbookId: z.string() }))
  .handler(async ({ data, context }) => {
    await assertYearbookOperational(data.yearbookId);
    const { getYearbookPreparationBookMap } = await import("./preparation/preparation.server");
    return await getYearbookPreparationBookMap(data.yearbookId, context.userId);
  });

/**
 * Retrieves approved Design Queue for the Super Admin / Coordinator.
 */
export const getDesignQueueFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ yearbookId: z.string() }))
  .handler(async ({ data, context }) => {
    await assertYearbookOperational(data.yearbookId);
    const { getDesignQueue } = await import("./preparation/preparation.server");
    return await getDesignQueue(data.yearbookId, context.userId);
  });

/**
 * Queues verified high-resolution assets for Canva transfer.
 */
export const queueDesignPacketAssetTransfersFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ snapshotId: z.string() }))
  .handler(async ({ data, context }) => {
    const { queueDesignPacketAssetTransfers } = await import("./preparation/preparation.server");
    return await queueDesignPacketAssetTransfers(data.snapshotId, context.userId);
  });

/**
 * Super Admin: Approves the Whole-Yearbook Readiness Gate.
 */
export const createWholeYearbookReadinessManifestFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ yearbookId: z.string() }))
  .handler(async ({ data, context }) => {
    await assertYearbookOperational(data.yearbookId);
    const { createWholeYearbookReadinessManifest } =
      await import("./preparation/preparation.server");
    return await createWholeYearbookReadinessManifest(data.yearbookId, context.userId);
  });

/**
 * Retrieves Whole-Yearbook Readiness Gate status.
 */
export const getWholeYearbookReadinessStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ yearbookId: z.string() }))
  .handler(async ({ data, context }) => {
    await assertYearbookOperational(data.yearbookId);
    const { getWholeYearbookReadinessStatus } = await import("./preparation/preparation.server");
    return await getWholeYearbookReadinessStatus(data.yearbookId, context.userId);
  });
