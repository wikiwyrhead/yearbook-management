/**
 * Server-only settings management for storage providers.
 *
 * This module handles reading/writing center, yearbook, organization, and member-level
 * storage configurations in the database.
 */
import { supabaseAdmin } from "../../integrations/supabase/client.server.ts";
import { sealCredentials, openCredentials } from "./credentials.server.ts";
import type { StorageProviderId } from "./storage-provider.ts";
import { getStorageProvider, resolveRef, resolveCenterRef } from "./registry.server.ts";
import { googleDriveProvider } from "./google-drive.provider.ts";

// --- Center Storage Connections ---

export async function listCenterStorage(centerId: string) {
  const { data, error } = await supabaseAdmin
    .from("center_storage_connections")
    .select("*")
    .eq("center_id", centerId);
  if (error) throw error;

  return Promise.all(
    ((data || []) as any[]).map(async (conn: any) => {
      const provider = getStorageProvider(conn.provider);
      const ref = await resolveCenterRef(centerId, conn.provider as StorageProviderId);
      const state = await provider.getConnectionStatus(ref);
      return {
        ...conn,
        status: state.status,
        accountEmail: state.accountEmail || conn.account_email,
        detail: state.detail,
      };
    }),
  );
}

export async function upsertCenterConnection(data: {
  centerId: string;
  provider: StorageProviderId;
  accessToken?: string | null;
  refreshToken?: string | null;
  expiresAt?: string | null;
  accountEmail?: string | null;
  scopes?: string[];
  rootFolderId?: string | null;
  userId?: string;
}) {
  const credentials = sealCredentials({
    accessToken: data.accessToken ?? undefined,
    refreshToken: data.refreshToken ?? undefined,
    expiresAt: data.expiresAt ?? undefined,
  });

  const { error } = await supabaseAdmin.from("center_storage_connections").upsert({
    center_id: data.centerId,
    provider: data.provider,
    credentials,
    account_email: data.accountEmail ?? null,
    scopes: data.scopes ?? ["https://www.googleapis.com/auth/drive.file"],
    root_folder_id: data.rootFolderId ?? null,
    status: "connected",
    connected_by: data.userId ?? null,
    updated_at: new Date().toISOString(),
  });

  if (error) throw error;
  return { success: true };
}

export async function updateCenterCredentials(
  centerId: string,
  provider: StorageProviderId,
  data: {
    accessToken?: string | null;
    refreshToken?: string | null;
    expiresAt?: string | null;
  },
) {
  const { data: existing } = await supabaseAdmin
    .from("center_storage_connections")
    .select("credentials")
    .eq("center_id", centerId)
    .eq("provider", provider)
    .maybeSingle();

  const current = openCredentials((existing as any)?.credentials);
  const updated = sealCredentials({
    ...current,
    accessToken: data.accessToken ?? current.accessToken,
    refreshToken: data.refreshToken ?? current.refreshToken,
    expiresAt: data.expiresAt ?? current.expiresAt,
  });

  const { error } = await supabaseAdmin
    .from("center_storage_connections")
    .update({ credentials: updated, updated_at: new Date().toISOString() })
    .eq("center_id", centerId)
    .eq("provider", provider);

  if (error) throw error;
  return { success: true };
}

export async function disconnectCenterStorage(centerId: string, provider: StorageProviderId) {
  const ref = await resolveCenterRef(centerId, provider);
  if (provider === "google_drive" && (ref as any).refreshToken) {
    const { revokeGoogleToken } = await import("./google-drive.provider");
    await revokeGoogleToken((ref as any).refreshToken);
  }

  const { error } = await supabaseAdmin
    .from("center_storage_connections")
    .delete()
    .eq("center_id", centerId)
    .eq("provider", provider);

  if (error) throw error;
  return { success: true };
}

export async function setupYearbookCenterFolders(
  yearbookId: string,
  centerId: string,
  rootFolderId?: string,
) {
  const ref = await resolveCenterRef(centerId, "google_drive");
  if (!ref.accessToken) {
    throw new Error("Center Google Drive connection not active.");
  }

  // Get Center name and Yearbook title
  const [centerRes, ybRes] = await Promise.all([
    supabaseAdmin.from("schools").select("name").eq("id", centerId).single(),
    supabaseAdmin.from("yearbooks").select("title, year").eq("id", yearbookId).single(),
  ]);

  const centerName = centerRes.data?.name || "Center";
  const yb = ybRes.data;
  const yearbookTitle = `${yb?.year || 2026} - ${yb?.title || "Yearbook"}`;

  const folders = await googleDriveProvider.setupYearbookFolders(
    ref,
    centerName,
    yearbookTitle,
    rootFolderId ||
      (ref.scope === "center" || ref.scope === "organization" ? ref.rootFolderId : undefined),
  );

  // Update yearbook_storage_config with folder IDs
  const folderPath = rootFolderId
    ? `${yearbookTitle}`
    : `Milestone Yearbook / ${centerName} / ${yearbookTitle}`;

  const { error } = await supabaseAdmin.from("yearbook_storage_config").upsert({
    yearbook_id: yearbookId,
    center_id: centerId,
    mode: "provider",
    provider: "google_drive",
    folder_id: folders.yearbookFolderId,
    folder_path: folderPath,
    assets_folder_id: folders.assetsFolderId,
    portraits_folder_id: folders.portraitsFolderId,
    proofs_folder_id: folders.proofsFolderId,
    production_folder_id: folders.productionFolderId,
    updated_at: new Date().toISOString(),
  });

  if (error) throw error;
  return folders;
}

export async function setAuthoritativeCenterFolder(
  centerId: string,
  yearbookId: string,
  folderId: string,
) {
  const ref = await resolveCenterRef(centerId, "google_drive");
  if (!ref.accessToken) {
    throw new Error("Center Google Drive is not connected. Please connect Google Drive first.");
  }

  // 1. Verify folder access via files.get
  const folderInfo = await googleDriveProvider.verifyFolderAccess(ref, folderId);
  if (!folderInfo.isFolder) {
    throw new Error(`The provided Google Drive ID (${folderId}) is a file, not a folder.`);
  }
  if (folderInfo.trashed) {
    throw new Error(`The specified Google Drive folder is in trash.`);
  }

  // 2. Save root_folder_id on center_storage_connections
  await supabaseAdmin
    .from("center_storage_connections")
    .update({
      root_folder_id: folderId,
      status: "connected",
      updated_at: new Date().toISOString(),
    })
    .eq("center_id", centerId)
    .eq("provider", "google_drive");

  // 3. Set up Yearbook subfolders under this authoritative folder
  const folders = await setupYearbookCenterFolders(yearbookId, centerId, folderId);

  return {
    success: true,
    folderInfo,
    folders,
  };
}

export async function uploadTestAssetToDrive(centerId: string, yearbookId: string) {
  const ref = await resolveCenterRef(centerId, "google_drive");
  if (!ref.accessToken) throw new Error("Center Google Drive is not connected");

  const config = await readYearbookStorage(yearbookId);
  const targetFolderId =
    config?.assets_folder_id ||
    config?.folder_id ||
    (ref.scope === "center" ? ref.rootFolderId : undefined);
  if (!targetFolderId) throw new Error("No target Assets folder configured for yearbook");

  const testFileName = `milestone_verification_${Date.now()}.txt`;
  const content = `Milestone Yearbook Storage Test\nTimestamp: ${new Date().toISOString()}\nCenter: ${centerId}\nYearbook: ${yearbookId}\n`;
  const bytes = Buffer.from(content, "utf8");

  const uploaded = await googleDriveProvider.uploadFile(
    ref,
    targetFolderId,
    testFileName,
    "text/plain",
    bytes,
  );
  const downloaded = await googleDriveProvider.downloadFile(ref, uploaded.id);
  const downloadedText = Buffer.from(downloaded.bytes).toString("utf8");

  return {
    success: true,
    uploadedFile: uploaded,
    downloadVerified: downloadedText === content,
  };
}

// --- Organization Storage Connections ---

export async function listOrganizationStorage() {
  const { data, error } = await supabaseAdmin.from("organization_storage_connections").select("*");
  if (error) throw error;

  return Promise.all(
    ((data || []) as any[]).map(async (conn: any) => {
      const provider = getStorageProvider(conn.provider);
      const ref = await resolveRef("organization", conn.provider as StorageProviderId, "");
      const state = await provider.getConnectionStatus(ref);
      return {
        ...conn,
        status: state.status,
        accountEmail: state.accountEmail,
        detail: state.detail,
      };
    }),
  );
}

export async function upsertOrganizationConnection(data: {
  provider: StorageProviderId;
  displayName?: string | null;
  rootFolderId?: string | null;
  rootFolderPath?: string | null;
  isDefault?: boolean;
  connectionKey?: string | null;
  accessToken?: string | null;
  refreshToken?: string | null;
  userId: string;
}) {
  const credentials = sealCredentials({
    connectionKey: data.connectionKey ?? undefined,
    accessToken: data.accessToken ?? undefined,
    refreshToken: data.refreshToken ?? undefined,
  });

  const { error } = await supabaseAdmin.from("organization_storage_connections").upsert({
    provider: data.provider,
    display_name: data.displayName || data.provider,
    root_folder_id: data.rootFolderId ?? null,
    root_folder_path: data.rootFolderPath ?? null,
    is_default: data.isDefault ?? false,
    credentials,
    updated_at: new Date().toISOString(),
  });

  if (error) throw error;
  return { success: true };
}

export async function disconnectOrganization(provider: StorageProviderId) {
  const { error } = await supabaseAdmin
    .from("organization_storage_connections")
    .delete()
    .eq("provider", provider);
  if (error) throw error;
  return { success: true };
}

// --- Yearbook Storage Config ---

export async function readYearbookStorage(yearbookId: string) {
  const { data, error } = await supabaseAdmin
    .from("yearbook_storage_config")
    .select("*")
    .eq("yearbook_id", yearbookId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function writeYearbookStorage(data: {
  yearbookId: string;
  centerId?: string | null;
  mode: "inherit_organization" | "inherit_center" | "provider" | "milestone";
  provider?: StorageProviderId | null;
  folderId?: string | null;
  folderPath?: string | null;
  allowMemberSources?: boolean;
  additionalProviders?: StorageProviderId[];
}) {
  const { error } = await supabaseAdmin.from("yearbook_storage_config").upsert({
    yearbook_id: data.yearbookId,
    center_id: data.centerId ?? null,
    mode: data.mode,
    provider: data.provider ?? null,
    folder_id: data.folderId ?? null,
    folder_path: data.folderPath ?? null,
    allow_member_sources: data.allowMemberSources ?? true,
    additional_providers: data.additionalProviders || [],
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
  return { success: true };
}

// --- Member Storage Connections ---

export async function listMemberConnections(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("member_storage_connections")
    .select("*")
    .eq("user_id", userId);
  if (error) throw error;

  return Promise.all(
    ((data || []) as any[]).map(async (conn: any) => {
      const provider = getStorageProvider(conn.provider);
      const ref = await resolveRef("member", conn.provider as StorageProviderId, userId);
      const state = await provider.getConnectionStatus(ref);
      return {
        ...conn,
        status: state.status,
        accountEmail: state.accountEmail,
        detail: state.detail,
      };
    }),
  );
}

export async function upsertMemberConnection(data: {
  provider: StorageProviderId;
  userId: string;
  connectionKey?: string | null;
  accessToken?: string | null;
  refreshToken?: string | null;
  accountEmail?: string | null;
}) {
  const credentials = sealCredentials({
    connectionKey: data.connectionKey ?? undefined,
    accessToken: data.accessToken ?? undefined,
    refreshToken: data.refreshToken ?? undefined,
  });

  const { error } = await supabaseAdmin.from("member_storage_connections").upsert({
    user_id: data.userId,
    provider: data.provider,
    credentials,
    account_email: data.accountEmail ?? null,
    updated_at: new Date().toISOString(),
  });

  if (error) throw error;
  return { success: true };
}

export async function disconnectMember(userId: string, provider: StorageProviderId) {
  const { error } = await supabaseAdmin
    .from("member_storage_connections")
    .delete()
    .eq("user_id", userId)
    .eq("provider", provider);
  if (error) throw error;
  return { success: true };
}
