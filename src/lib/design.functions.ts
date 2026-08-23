/**
 * Hidden Super-Admin Design Provider & Generic Layout RPC Server Functions
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertYearbookOperational } from "@/lib/operating-mode.server";

// ============================================================================
// 1. SUPER ADMIN ONLY RPC FUNCTIONS
// ============================================================================

/**
 * Super Admin: Get platform Canva connection status.
 */
export const adminGetDesignProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { adminGetDesignProviderConnection } = await import("./design/admin-design.server.ts");
    return adminGetDesignProviderConnection({ id: context.userId, email: "" });
  });

/**
 * Super Admin: Start Canva OAuth authorization.
 */
export const adminStartCanvaOAuthFlow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ yearbookId: z.string().optional() }))
  .handler(async ({ data, context }) => {
    if (data.yearbookId) {
      await assertYearbookOperational(data.yearbookId);
    }
    const { adminStartCanvaOAuth } = await import("./design/admin-design.server.ts");
    return adminStartCanvaOAuth({ id: context.userId, email: "" }, data.yearbookId);
  });

/**
 * Super Admin: Disconnect Canva design provider.
 */
export const adminDisconnectDesignProviderFlow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { adminDisconnectDesignProvider } = await import("./design/admin-design.server.ts");
    return adminDisconnectDesignProvider({ id: context.userId, email: "" });
  });

/**
 * Super Admin: List Canva designs.
 */
export const adminListExternalDesignsFlow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ search: z.string().optional() }))
  .handler(async ({ data, context }) => {
    const { adminListExternalDesigns } = await import("./design/admin-design.server.ts");
    return adminListExternalDesigns({ id: context.userId, email: "" }, data.search);
  });

/**
 * Super Admin: Link a Canva design to a Yearbook.
 */
export const adminLinkYearbookDesignFlow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ yearbookId: z.string(), externalDesignId: z.string() }))
  .handler(async ({ data, context }) => {
    await assertYearbookOperational(data.yearbookId);
    const { adminLinkYearbookDesign } = await import("./design/admin-design.server.ts");
    return adminLinkYearbookDesign(
      { id: context.userId, email: "" },
      data.yearbookId,
      data.externalDesignId,
    );
  });

/**
 * Super Admin: Replace a Yearbook's active Canva design.
 */
export const adminReplaceYearbookDesignFlow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ yearbookId: z.string(), newExternalDesignId: z.string() }))
  .handler(async ({ data, context }) => {
    await assertYearbookOperational(data.yearbookId);
    const { adminReplaceYearbookDesign } = await import("./design/admin-design.server.ts");
    return adminReplaceYearbookDesign(
      { id: context.userId, email: "" },
      data.yearbookId,
      data.newExternalDesignId,
    );
  });

/**
 * Super Admin: Map Canva pages to a Milestone page.
 */
export const adminMapDesignPagesFlow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      yearbookId: z.string(),
      pageId: z.string(),
      externalPageNumbers: z.array(z.number()),
    }),
  )
  .handler(async ({ data, context }) => {
    await assertYearbookOperational(data.yearbookId);
    const { adminMapDesignPages } = await import("./design/admin-design.server.ts");
    return adminMapDesignPages(
      { id: context.userId, email: "" },
      data.yearbookId,
      data.pageId,
      data.externalPageNumbers,
    );
  });

/**
 * Super Admin: Open Canva editor with signed correlation state.
 * Resolves active binding and design ID on server.
 */
export const adminOpenExternalDesignFlow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ yearbookId: z.string() }))
  .handler(async ({ data, context }) => {
    await assertYearbookOperational(data.yearbookId);
    const { adminOpenExternalDesign } = await import("./design/admin-design.server.ts");
    return adminOpenExternalDesign({ id: context.userId, email: "" }, data.yearbookId);
  });

// ============================================================================
// 2. GENERIC MILESTONE NON-ADMIN RPC FUNCTIONS
// ============================================================================

/**
 * Generic: Get Yearbook layout status (Sanitized, zero Canva metadata).
 */
export const getYearbookLayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ yearbookId: z.string() }))
  .handler(async ({ data, context }) => {
    await assertYearbookOperational(data.yearbookId);
    const { getYearbookLayoutStatus } = await import("./design/layout.server.ts");
    return getYearbookLayoutStatus({ id: context.userId, email: "" }, data.yearbookId);
  });

/**
 * Generic: Request layout PDF proof generation (Authorized Coordinators & assigned Editorial Members).
 */
export const requestLayoutProof = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      yearbookId: z.string(),
      pageId: z.string(),
      idempotencyKey: z.string().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    await assertYearbookOperational(data.yearbookId);
    const { requestProofGeneration } = await import("./design/layout.server.ts");
    return requestProofGeneration(
      { id: context.userId, email: "" },
      data.yearbookId,
      data.pageId,
      data.idempotencyKey,
    );
  });

/**
 * Generic: Send approved asset to layout library.
 */
export const sendAssetToLayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      yearbookId: z.string(),
      assetId: z.string(),
      targetPageId: z.string(),
    }),
  )
  .handler(async ({ data, context }) => {
    await assertYearbookOperational(data.yearbookId);
    const { uploadAssetToLayout } = await import("./design/layout.server.ts");
    return uploadAssetToLayout({ id: context.userId, email: "" }, data.yearbookId, {
      assetId: data.assetId,
      targetPageId: data.targetPageId,
    });
  });
