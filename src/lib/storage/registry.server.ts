/**
 * Server-only provider registry + credential resolution.
 *
 * Resolution rules (Phase 6 storage ownership model):
 *  - organization scope -> organization_storage_connections (Super Admin owned)
 *  - member scope       -> member_storage_connections (that member only)
 *
 * A member credential can only ever be used as an IMPORT SOURCE. It is never
 * used to write yearbook production storage.
 */
import { boxProvider } from "./box.provider.ts";
import { googleDriveProvider } from "./google-drive.provider.ts";
import { openCredentials } from "./credentials.server.ts";
import type { CredentialRef, StorageProvider, StorageProviderId } from "./storage-provider.ts";

const REGISTRY: Record<StorageProviderId, StorageProvider> = {
  google_drive: googleDriveProvider,
  box: boxProvider,
};

export function getStorageProvider(id: string): StorageProvider {
  const provider = REGISTRY[id as StorageProviderId];
  if (!provider) throw new Error(`Unknown storage provider: ${id}`);
  return provider;
}

export function listStorageProviders(): StorageProvider[] {
  return Object.values(REGISTRY);
}

export async function resolveOrganizationRef(provider: StorageProviderId): Promise<CredentialRef> {
  const { supabaseAdmin } = await import("../../integrations/supabase/client.server.ts");
  const { data } = await supabaseAdmin
    .from("organization_storage_connections")
    .select("credentials")
    .eq("provider", provider)
    .maybeSingle();
  const creds = openCredentials((data as any)?.credentials);
  const ref: CredentialRef = { scope: "organization" };
  if (creds.connectionKey) ref.connectionKey = creds.connectionKey;
  if (creds.accessToken) ref.accessToken = creds.accessToken;
  return ref;
}

export async function resolveMemberRef(
  userId: string,
  provider: StorageProviderId,
): Promise<CredentialRef> {
  const { supabaseAdmin } = await import("../../integrations/supabase/client.server.ts");
  const { data } = await supabaseAdmin
    .from("member_storage_connections")
    .select("credentials")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();
  const creds = openCredentials((data as any)?.credentials);
  const ref: CredentialRef = { scope: "member", userId };
  if (creds.connectionKey) ref.connectionKey = creds.connectionKey;
  if (creds.accessToken) ref.accessToken = creds.accessToken;
  return ref;
}

export async function resolveCenterRef(
  centerId: string,
  provider: StorageProviderId,
): Promise<CredentialRef> {
  const { supabaseAdmin } = await import("../../integrations/supabase/client.server.ts");
  const { data } = await supabaseAdmin
    .from("center_storage_connections")
    .select("credentials, root_folder_id")
    .eq("center_id", centerId)
    .eq("provider", provider)
    .maybeSingle();
  const creds = openCredentials((data as any)?.credentials);
  const ref: CredentialRef = { scope: "center", centerId };
  if (creds.connectionKey) ref.connectionKey = creds.connectionKey;
  if (creds.accessToken) ref.accessToken = creds.accessToken;
  if (creds.refreshToken) ref.refreshToken = creds.refreshToken;
  if (creds.expiresAt) ref.expiresAt = creds.expiresAt;
  if ((data as any)?.root_folder_id) ref.rootFolderId = (data as any).root_folder_id;
  return ref;
}

export async function resolveRef(
  scope: "center" | "organization" | "member",
  provider: StorageProviderId,
  targetId: string, // centerId for center, userId for member, unused for org
): Promise<CredentialRef> {
  if (scope === "center") return resolveCenterRef(targetId, provider);
  if (scope === "organization") return resolveOrganizationRef(provider);
  return resolveMemberRef(targetId, provider);
}
