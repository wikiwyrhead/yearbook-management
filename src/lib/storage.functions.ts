/**
 * Phase 6 — storage provider server functions.
 *
 * Thin wrapper file: only imports, types and createServerFn declarations.
 * All runtime logic lives in src/lib/storage/*.server.ts.
 *
 * No handler ever returns the `credentials` column. OAuth tokens stay server-side.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const providerEnum = z.enum(["google_drive", "box"]);
const scopeEnum = z.enum(["organization", "member"]);

export const getOrganizationStorage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requireSuperAdmin } = await import("./storage/access.server");
    const { listOrganizationStorage } = await import("./storage/settings.server");
    await requireSuperAdmin(context.supabase as any, context.userId);
    return listOrganizationStorage();
  });

export const saveOrganizationConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      provider: providerEnum,
      displayName: z.string().optional(),
      rootFolderId: z.string().optional(),
      rootFolderPath: z.string().optional(),
      isDefault: z.boolean().optional(),
      connectionKey: z.string().optional(),
      accessToken: z.string().optional(),
      refreshToken: z.string().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { requireSuperAdmin } = await import("./storage/access.server");
    const { upsertOrganizationConnection } = await import("./storage/settings.server");
    await requireSuperAdmin(context.supabase as any, context.userId);
    return upsertOrganizationConnection({ ...data, userId: context.userId, displayName: data.displayName ?? null, rootFolderId: data.rootFolderId ?? null, rootFolderPath: data.rootFolderPath ?? null, connectionKey: data.connectionKey ?? null, accessToken: data.accessToken ?? null, refreshToken: data.refreshToken ?? null });
  });

export const disconnectOrganizationProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ provider: providerEnum }))
  .handler(async ({ data, context }) => {
    const { requireSuperAdmin } = await import("./storage/access.server");
    const { disconnectOrganization } = await import("./storage/settings.server");
    await requireSuperAdmin(context.supabase as any, context.userId);
    return disconnectOrganization(data.provider);
  });

export const getYearbookStorage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ yearbookId: z.string() }))
  .handler(async ({ data, context }) => {
    const { requireYearbookMember } = await import("./storage/access.server");
    const { readYearbookStorage } = await import("./storage/settings.server");
    await requireYearbookMember(context.supabase as any, context.userId, data.yearbookId);
    return readYearbookStorage(data.yearbookId);
  });

export const saveYearbookStorage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      yearbookId: z.string(),
      mode: z.enum(["inherit_organization", "provider", "milestone"]),
      provider: providerEnum.optional(),
      folderId: z.string().optional(),
      folderPath: z.string().optional(),
      allowMemberSources: z.boolean().optional(),
      additionalProviders: z.array(providerEnum).optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { requireYearbookCoordinator } = await import("./storage/access.server");
    const { writeYearbookStorage } = await import("./storage/settings.server");
    await requireYearbookCoordinator(context.supabase as any, context.userId, data.yearbookId);
    return writeYearbookStorage({ ...data, provider: data.provider ?? null, folderId: data.folderId ?? null, folderPath: data.folderPath ?? null });
  });

export const getMyStorageConnections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listMemberConnections } = await import("./storage/settings.server");
    return listMemberConnections(context.userId);
  });

export const saveMyStorageConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      provider: providerEnum,
      connectionKey: z.string().optional(),
      accessToken: z.string().optional(),
      refreshToken: z.string().optional(),
      accountEmail: z.string().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { upsertMemberConnection } = await import("./storage/settings.server");
    return upsertMemberConnection({ ...data, userId: context.userId, connectionKey: data.connectionKey ?? null, accessToken: data.accessToken ?? null, refreshToken: data.refreshToken ?? null, accountEmail: data.accountEmail ?? null });
  });

export const disconnectMyStorage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ provider: providerEnum }))
  .handler(async ({ data, context }) => {
    const { disconnectMember } = await import("./storage/settings.server");
    return disconnectMember(context.userId, data.provider);
  });

export const browseProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      yearbookId: z.string(),
      provider: providerEnum,
      scope: scopeEnum,
      folderId: z.string().optional(),
      search: z.string().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { requireYearbookMember } = await import("./storage/access.server");
    const { browse } = await import("./storage/browse.server");
    // Cross-yearbook isolation: a caller must belong to the yearbook they browse for.
    await requireYearbookMember(context.supabase as any, context.userId, data.yearbookId);
    return browse({ ...data, userId: context.userId });
  });

export const importProviderFiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      yearbookId: z.string(),
      provider: providerEnum,
      scope: scopeEnum,
      fileIds: z.array(z.string()).min(1).max(50),
      folderId: z.string().optional(),
      studentId: z.string().optional(),
      sectionId: z.string().optional(),
      category: z.string().optional(),
      replacesAssetId: z.string().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { assertImportAllowed } = await import("./storage/access.server");
    const { runImport } = await import("./storage/browse.server");
    await assertImportAllowed(
      context.supabase as any,
      context.userId,
      data.yearbookId,
      data.studentId,
    );
    return runImport({ ...data, userId: context.userId });
  });
