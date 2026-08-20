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
    return writeYearbookStorage({
      ...data,
      provider: data.provider ?? null,
      folderId: data.folderId ?? null,
      folderPath: data.folderPath ?? null,
      allowMemberSources: data.allowMemberSources ?? true,
      additionalProviders: data.additionalProviders || [],
    });
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

export const startOAuthFlow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ provider: providerEnum, scope: scopeEnum, yearbookId: z.string().optional() }))
  .handler(async ({ data, context }) => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { generateOAuthState } = await import("./storage/oauth-state.server");
    const origin = new URL(getRequest()!.url).origin;

    if (data.provider === "box") {
      const state = generateOAuthState({
        provider: "box",
        scope: data.scope,
        userId: context.userId,
        yearbookId: data.yearbookId ?? null,
      });
      const clientId = process.env["BOX_CLIENT_ID"];
      if (!clientId) throw new Error("Box client ID not configured");
      const url = new URL("https://account.box.com/api/oauth2/authorize");
      url.searchParams.set("response_type", "code");
      url.searchParams.set("client_id", clientId);
      url.searchParams.set("state", state);
      url.searchParams.set("redirect_uri", `${origin}/api/public/auth/callback`);
      return { url: url.toString(), mode: "redirect" as const };
    }

    if (data.provider === "google_drive") {
      // Member-scope Google Drive uses the Lovable App User Connector: each
      // member consents with their own Google account and the gateway issues
      // an opaque per-user connection key. Organization-scope Google Drive is
      // configured by linking a workspace App connector, not through OAuth here.
      if (data.scope !== "member") {
        throw new Error(
          "Organization Google Drive is configured by linking the workspace Google Drive connector, not through this OAuth flow.",
        );
      }
      const clientAPIKey = process.env["GOOGLE_DRIVE_APP_USER_CONNECTOR_CLIENT_API_KEY"];
      if (!clientAPIKey) {
        throw new Error(
          "Google Drive App User Connector is not configured for this project (missing client API key).",
        );
      }
      const { authorizeAppUserOAuth } = await import("@/integrations/lovable/appUserConnector");
      const { getMemberConnectionKey } = await import("./storage/settings.server");
      const existingKey = await getMemberConnectionKey(context.userId, "google_drive");

      const { authorizationUrl } = await authorizeAppUserOAuth({
        gatewayBaseUrl: "https://connector-gateway.lovable.dev",
        connectorId: "google_drive",
        appUserId: context.userId,
        clientAPIKey,
        returnUrl: `${origin}/oauth/google-drive/return`,
        connectionAPIKey: existingKey ?? undefined,
        credentialsConfiguration: {
          scopes: [
            "https://www.googleapis.com/auth/userinfo.email",
            "https://www.googleapis.com/auth/userinfo.profile",
            "https://www.googleapis.com/auth/drive.readonly",
          ],
        },
      });
      return { url: authorizationUrl, mode: "popup" as const };
    }

    throw new Error(`OAuth not implemented for ${data.provider}`);
  });

/**
 * Complete the member Google Drive connection: exchange the one-time code from
 * the connector-gateway redirect for the per-user connection key and store it
 * encrypted against the signed-in member.
 */
export const completeGoogleDriveConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ code: z.string().min(1) }))
  .handler(async ({ data, context }) => {
    const { exchangeAppUserOAuthCode } = await import("@/integrations/lovable/appUserConnector");
    const { upsertMemberConnection } = await import("./storage/settings.server");
    const { connectionAPIKey, connectorId } = await exchangeAppUserOAuthCode(
      "https://connector-gateway.lovable.dev",
      data.code,
    );
    if (connectorId !== "google_drive") {
      throw new Error("OAuth completion returned the wrong connector");
    }
    await upsertMemberConnection({
      userId: context.userId,
      provider: "google_drive",
      connectionKey: connectionAPIKey,
      accessToken: null,
      refreshToken: null,
      accountEmail: null,
    });
    return { success: true };
  });

export const disconnectMyStorage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ provider: providerEnum }))
  .handler(async ({ data, context }) => {
    const { disconnectMember, getMemberConnectionKey } = await import("./storage/settings.server");
    if (data.provider === "google_drive") {
      const key = await getMemberConnectionKey(context.userId, "google_drive");
      if (key) {
        const { disconnectAppUser } = await import("@/integrations/lovable/appUserConnector");
        try {
          await disconnectAppUser({
            gatewayBaseUrl: "https://connector-gateway.lovable.dev",
            connectionAPIKey: key,
            connectorId: "google_drive",
          });
        } catch (err) {
          // Gateway-side revocation failure must not strand the local row.
          console.error("Google Drive gateway disconnect failed:", err);
        }
      }
    }
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
    return browse({ ...data, userId: context.userId, folderId: data.folderId ?? undefined, search: data.search ?? undefined });
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
    return runImport({ ...data, userId: context.userId, folderId: data.folderId ?? undefined, studentId: data.studentId ?? undefined, sectionId: data.sectionId ?? undefined, category: data.category ?? undefined, replacesAssetId: data.replacesAssetId ?? undefined });
  });
