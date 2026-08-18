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
const REGISTRY = {
    google_drive: googleDriveProvider,
    box: boxProvider,
};
export function getStorageProvider(id) {
    const provider = REGISTRY[id];
    if (!provider)
        throw new Error(`Unknown storage provider: ${id}`);
    return provider;
}
export function listStorageProviders() {
    return Object.values(REGISTRY);
}
export async function resolveOrganizationRef(provider) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
        .from("organization_storage_connections")
        .select("credentials")
        .eq("provider", provider)
        .maybeSingle();
    const creds = openCredentials(data?.credentials);
    const ref = { scope: "organization" };
    if (creds.connectionKey)
        ref.connectionKey = creds.connectionKey;
    if (creds.accessToken)
        ref.accessToken = creds.accessToken;
    return ref;
}
export async function resolveMemberRef(userId, provider) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
        .from("member_storage_connections")
        .select("credentials")
        .eq("user_id", userId)
        .eq("provider", provider)
        .maybeSingle();
    const creds = openCredentials(data?.credentials);
    const ref = { scope: "member", userId };
    if (creds.connectionKey)
        ref.connectionKey = creds.connectionKey;
    if (creds.accessToken)
        ref.accessToken = creds.accessToken;
    return ref;
}
export async function resolveRef(scope, provider, userId) {
    return scope === "organization"
        ? resolveOrganizationRef(provider)
        : resolveMemberRef(userId, provider);
}
