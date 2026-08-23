/**
 * Phase 6 — Storage provider server functions.
 *
 * Center-scoped & Organization-scoped storage management.
 * All runtime logic lives in src/lib/storage/*.server.ts.
 *
 * No handler ever returns credentials/tokens to the client.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const providerEnum = z.enum(["google_drive", "box"]);
const scopeEnum = z.enum(["center", "organization", "member"]);

// --- Center Storage Server Functions ---

export const getCenterStorage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ centerId: z.string() }))
  .handler(async ({ data, context }) => {
    const { requireCenterManager } = await import("./storage/access.server");
    const { listCenterStorage } = await import("./storage/settings.server");
    await requireCenterManager(context.supabase as any, context.userId, data.centerId);
    return listCenterStorage(data.centerId);
  });

export const disconnectCenterStorageConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ centerId: z.string(), provider: providerEnum }))
  .handler(async ({ data, context }) => {
    const { requireCenterManager } = await import("./storage/access.server");
    const { disconnectCenterStorage } = await import("./storage/settings.server");
    await requireCenterManager(context.supabase as any, context.userId, data.centerId);
    return disconnectCenterStorage(data.centerId, data.provider);
  });

export const setupYearbookDriveFolders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({ yearbookId: z.string(), centerId: z.string(), rootFolderId: z.string().optional() }),
  )
  .handler(async ({ data, context }) => {
    const { requireYearbookCoordinator } = await import("./storage/access.server");
    const { setupYearbookCenterFolders } = await import("./storage/settings.server");
    await requireYearbookCoordinator(context.supabase as any, context.userId, data.yearbookId);
    return setupYearbookCenterFolders(data.yearbookId, data.centerId, data.rootFolderId);
  });

export const setCenterDriveRootFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ centerId: z.string(), yearbookId: z.string(), folderId: z.string() }))
  .handler(async ({ data, context }) => {
    const { requireCenterManager } = await import("./storage/access.server");
    const { setAuthoritativeCenterFolder } = await import("./storage/settings.server");
    await requireCenterManager(context.supabase as any, context.userId, data.centerId);
    return setAuthoritativeCenterFolder(data.centerId, data.yearbookId, data.folderId);
  });

export const runStorageUploadVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ centerId: z.string(), yearbookId: z.string() }))
  .handler(async ({ data, context }) => {
    const { requireCenterManager } = await import("./storage/access.server");
    const { uploadTestAssetToDrive } = await import("./storage/settings.server");
    await requireCenterManager(context.supabase as any, context.userId, data.centerId);
    return uploadTestAssetToDrive(data.centerId, data.yearbookId);
  });

// --- Organization Storage Server Functions ---

export const getOrganizationStorage = createServerFn({ method: "POST" })
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
    return upsertOrganizationConnection({
      ...data,
      userId: context.userId,
      displayName: data.displayName ?? null,
      rootFolderId: data.rootFolderId ?? null,
      rootFolderPath: data.rootFolderPath ?? null,
      connectionKey: data.connectionKey ?? null,
      accessToken: data.accessToken ?? null,
      refreshToken: data.refreshToken ?? null,
      isDefault: data.isDefault ?? false,
    });
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

// --- Yearbook Storage Server Functions ---

export const getYearbookStorage = createServerFn({ method: "POST" })
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
      centerId: z.string().optional(),
      mode: z.enum(["inherit_organization", "inherit_center", "provider", "milestone"]),
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
    return writeYearbookStorage({
      ...data,
      centerId: data.centerId ?? null,
      provider: data.provider ?? null,
      folderId: data.folderId ?? null,
      folderPath: data.folderPath ?? null,
      allowMemberSources: data.allowMemberSources ?? true,
      additionalProviders: data.additionalProviders || [],
    });
  });

// --- Member Storage Server Functions ---

export const getMyStorageConnections = createServerFn({ method: "POST" })
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
    return upsertMemberConnection({
      ...data,
      userId: context.userId,
      connectionKey: data.connectionKey ?? null,
      accessToken: data.accessToken ?? null,
      refreshToken: data.refreshToken ?? null,
      accountEmail: data.accountEmail ?? null,
    });
  });

export const disconnectMyStorage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ provider: providerEnum }))
  .handler(async ({ data, context }) => {
    const { disconnectMember } = await import("./storage/settings.server");
    return disconnectMember(context.userId, data.provider);
  });

// --- OAuth Initiation ---

export const startOAuthFlow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      provider: providerEnum,
      scope: scopeEnum,
      centerId: z.string().optional(),
      yearbookId: z.string().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { generateOAuthState } = await import("./storage/oauth-state.server");
    const { getOAuthCallbackUrl } = await import("./app-url");
    const request = getRequest();
    const redirectUri = getOAuthCallbackUrl(request);

    // Permission enforcement
    if (data.scope === "center" && data.centerId) {
      const { requireCenterManager } = await import("./storage/access.server");
      await requireCenterManager(context.supabase as any, context.userId, data.centerId);
    } else if (data.scope === "organization") {
      const { requireSuperAdmin } = await import("./storage/access.server");
      await requireSuperAdmin(context.supabase as any, context.userId);
    }

    const state = generateOAuthState({
      provider: data.provider,
      scope: data.scope,
      userId: context.userId,
      centerId: data.centerId ?? null,
      yearbookId: data.yearbookId ?? null,
    });

    if (data.provider === "box") {
      const clientId = process.env["BOX_CLIENT_ID"];
      if (!clientId) throw new Error("Box client ID is not configured in environment variables.");
      const url = new URL("https://account.box.com/api/oauth2/authorize");
      url.searchParams.set("response_type", "code");
      url.searchParams.set("client_id", clientId);
      url.searchParams.set("state", state);
      url.searchParams.set("redirect_uri", redirectUri);
      return { url: url.toString(), mode: "redirect" as const };
    }

    if (data.provider === "google_drive") {
      const clientId = process.env["GOOGLE_CLIENT_ID"];
      const clientSecret = process.env["GOOGLE_CLIENT_SECRET"];

      if (!clientId || !clientSecret) {
        throw new Error(
          "Google Drive is not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.",
        );
      }

      const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      url.searchParams.set("response_type", "code");
      url.searchParams.set("client_id", clientId);
      url.searchParams.set("state", state);
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set("access_type", "offline");
      url.searchParams.set("prompt", "consent");
      url.searchParams.set(
        "scope",
        [
          "https://www.googleapis.com/auth/userinfo.email",
          "https://www.googleapis.com/auth/userinfo.profile",
          "https://www.googleapis.com/auth/drive.file",
        ].join(" "),
      );
      return { url: url.toString(), mode: "redirect" as const };
    }

    throw new Error(`OAuth not implemented for ${data.provider}`);
  });

// --- Remote File Browsing & Import ---

export const browseProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      yearbookId: z.string(),
      provider: providerEnum,
      scope: scopeEnum,
      centerId: z.string().optional(),
      folderId: z.string().optional(),
      search: z.string().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { requireYearbookMember } = await import("./storage/access.server");
    const { browse } = await import("./storage/browse.server");
    await requireYearbookMember(context.supabase as any, context.userId, data.yearbookId);
    return browse({
      ...data,
      userId: context.userId,
      targetId: data.scope === "center" && data.centerId ? data.centerId : context.userId,
      folderId: data.folderId ?? undefined,
      search: data.search ?? undefined,
    });
  });

export const importProviderFiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      yearbookId: z.string(),
      provider: providerEnum,
      scope: scopeEnum,
      centerId: z.string().optional(),
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
    return runImport({
      ...data,
      userId: context.userId,
      targetId: data.scope === "center" && data.centerId ? data.centerId : context.userId,
      folderId: data.folderId ?? undefined,
      studentId: data.studentId ?? undefined,
      sectionId: data.sectionId ?? undefined,
      category: data.category ?? undefined,
      replacesAssetId: data.replacesAssetId ?? undefined,
    });
  });
