/**
 * Phase 6 — Canva design provider server functions.
 * 
 * Thin wrapper file: only imports, types and createServerFn declarations.
 * All runtime logic lives in src/lib/design/*.server.ts.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const getCanvaConnection = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ yearbookId: z.string() }))
  .handler(async ({ data, context }) => {
    const { requireYearbookMember } = await import("./storage/access.server");
    const { readCanvaConnection } = await import("./design/canva.server");
    await requireYearbookMember(context.supabase as any, context.userId, data.yearbookId);
    return readCanvaConnection(data.yearbookId);
  });

export const saveCanvaConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      yearbookId: z.string(),
      accessToken: z.string().optional(),
      refreshToken: z.string().optional(),
      expiresIn: z.number().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { requireYearbookCoordinator } = await import("./storage/access.server");
    const { upsertCanvaConnection } = await import("./design/canva.server");
    await requireYearbookCoordinator(context.supabase as any, context.userId, data.yearbookId);
    
    // Explicit type mapping to satisfy exact optional properties
    const params: {
      yearbookId: string;
      accessToken: string | null;
      refreshToken: string | null;
      expiresIn?: number;
    } = {
      yearbookId: data.yearbookId,
      accessToken: data.accessToken ?? null,
      refreshToken: data.refreshToken ?? null,
    };
    if (data.expiresIn !== undefined) params.expiresIn = data.expiresIn;
    
    return upsertCanvaConnection(params);
  });

export const startCanvaOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ yearbookId: z.string() }))
  .handler(async ({ data, context }) => {
    const { generateOAuthState } = await import("./storage/oauth-state.server");
    const clientId = process.env["CANVA_CLIENT_ID"];
    if (!clientId) throw new Error("Canva client ID not configured");
    
    const state = generateOAuthState({
      provider: "canva",
      scope: "organization", // Canva currently scoped to yearbook which acts like org-level for that book
      userId: context.userId,
      yearbookId: data.yearbookId,
    });

    return {
      url: `https://www.canva.com/api/oauth/authorize?response_type=code&client_id=${clientId}&scope=design:content:read design:meta:read&state=${state}`
    };
  });

export const disconnectCanva = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ yearbookId: z.string() }))
  .handler(async ({ data, context }) => {
    const { requireYearbookCoordinator } = await import("./storage/access.server");
    const { deleteCanvaConnection } = await import("./design/canva.server");
    await requireYearbookCoordinator(context.supabase as any, context.userId, data.yearbookId);
    return deleteCanvaConnection(data.yearbookId);
  });

export const listCanvaDesigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ yearbookId: z.string(), search: z.string().optional() }))
  .handler(async ({ data, context }) => {
    const { requireYearbookMember } = await import("./storage/access.server");
    const { listDesigns } = await import("./design/canva.server");
    await requireYearbookMember(context.supabase as any, context.userId, data.yearbookId);
    return listDesigns(data.yearbookId, data.search);
  });

export const exportCanvaProof = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ yearbookId: z.string(), pageId: z.string(), designId: z.string() }))
  .handler(async ({ data, context }) => {
    const { requireYearbookEditor } = await import("./storage/access.server");
    const { startProofExport } = await import("./design/canva.server");
    await requireYearbookEditor(context.supabase as any, context.userId, data.yearbookId);
    return startProofExport({ ...data, userId: context.userId });
  });
