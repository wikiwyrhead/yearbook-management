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
import { boxProvider } from "./box.provider";
import { googleDriveProvider } from "./google-drive.provider";
import { openCredentials } from "./credentials.server";
import type { CredentialRef, StorageProvider, StorageProviderId } from "./storage-provider";

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
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
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
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
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

export async function resolveRef(
  scope: "organization" | "member",
  provider: StorageProviderId,
  userId: string,
): Promise<CredentialRef> {
  return scope === "organization"
    ? resolveOrganizationRef(provider)
    : resolveMemberRef(userId, provider);
}
