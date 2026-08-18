/**
 * Phase 6 — StorageProvider abstraction.
 *
 * Milestone remains the source of truth. External providers (Google Drive, Box)
 * are *sources*: they can be browsed and imported from, never depended upon.
 *
 * Nothing in this module reads secrets at module scope; credentials are resolved
 * per-call from a CredentialRef by server-only code.
 */
export class ProviderNotConfiguredError extends Error {
    constructor(providerId, hint) {
        super(`${providerId} is not configured: ${hint}`);
        this.name = "ProviderNotConfiguredError";
    }
}
export class ProviderAuthError extends Error {
    status;
    constructor(message, status = "needs_reauthorization") {
        super(message);
        this.name = "ProviderAuthError";
        this.status = status;
    }
}
/** Surface the provider's real status/body rather than a generic 500. */
export async function assertProviderResponse(res, providerId) {
    if (res.ok)
        return;
    const body = await res.text();
    if (res.status === 401 || res.status === 403) {
        throw new ProviderAuthError(`${providerId} authorization failed [${res.status}]: ${body}`);
    }
    throw new Error(`${providerId} request failed [${res.status}]: ${body}`);
}
