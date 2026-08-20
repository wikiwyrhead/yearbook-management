/**
 * Server-only settings management for storage providers.
 *
 * This module handles reading/writing organization, yearbook, and member-level
 * storage configurations in the database.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sealCredentials } from "./credentials.server";
import type { StorageProviderId } from "./storage-provider";
import { getStorageProvider, resolveRef } from "./registry.server";

export async function listOrganizationStorage() {
  const { data, error } = await supabaseAdmin
    .from("organization_storage_connections")
    .select("*");
  if (error) throw error;

  // Resolve connection status for each
  return Promise.all(
    (data || []).map(async (conn) => {
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
  mode: "inherit_organization" | "provider" | "milestone";
  provider?: StorageProviderId | null;
  folderId?: string | null;
  folderPath?: string | null;
  allowMemberSources?: boolean;
  additionalProviders?: StorageProviderId[];
}) {
  const { error } = await supabaseAdmin.from("yearbook_storage_config").upsert({
    yearbook_id: data.yearbookId,
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

export async function listMemberConnections(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("member_storage_connections")
    .select("*")
    .eq("user_id", userId);
  if (error) throw error;

  return Promise.all(
    (data || []).map(async (conn) => {
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

/**
 * Server-only read of a member's decrypted connection key (lovack_*).
 * Never returned to the browser — used to authorize gateway calls and
 * gateway-side revocation.
 */
export async function getMemberConnectionKey(
  userId: string,
  provider: StorageProviderId,
): Promise<string | null> {
  const { openCredentials } = await import("./credentials.server");
  const { data, error } = await supabaseAdmin
    .from("member_storage_connections")
    .select("credentials")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();
  if (error) throw error;
  const creds = openCredentials((data as any)?.credentials);
  return creds.connectionKey ?? null;
}
