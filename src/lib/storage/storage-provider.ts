/**
 * Phase 6 — StorageProvider abstraction.
 *
 * Milestone remains the source of truth. External providers (Google Drive, Box)
 * are *sources*: they can be browsed and imported from, never depended upon.
 *
 * Nothing in this module reads secrets at module scope; credentials are resolved
 * per-call from a CredentialRef by server-only code.
 */

export type StorageProviderId = "google_drive" | "box";

export type ConnectionStatus =
  | "connected"
  | "needs_reauthorization"
  | "disconnected"
  | "error";

export type ConnectionState = {
  status: ConnectionStatus;
  /** Human-readable explanation, shown in settings UI. */
  detail?: string | undefined;
  accountEmail?: string | undefined;
};

/**
 * Which credential set a call should use.
 * - organization: the org-wide connection configured by a Super Admin.
 * - member: an individual member's optional personal import source.
 *
 * A member ref can NEVER be used for yearbook production storage writes.
 */
export type CredentialRef =
  | { scope: "organization"; connectionKey?: string; accessToken?: string }
  | { scope: "member"; userId: string; connectionKey?: string; accessToken?: string };

export type RemoteFolder = {
  id: string;
  name: string;
  parentId?: string | undefined;
  path?: string | undefined;
};

export type RemoteFile = {
  id: string;
  name: string;
  mimeType: string;
  size?: number | undefined;
  modifiedAt?: string | undefined;
  webUrl?: string | undefined;
  thumbnailUrl?: string | undefined;
  parentId?: string | undefined;
};

export type DownloadedFile = {
  bytes: ArrayBuffer;
  mimeType: string;
  name: string;
};

export type ListOptions = {
  pageSize?: number | undefined;
  pageToken?: string | undefined;
};

export type ListResult<T> = {
  items: T[];
  nextPageToken?: string | undefined;
};

export interface StorageProvider {
  readonly id: StorageProviderId;
  readonly displayName: string;

  /** True when the provider has the app-level credentials required to run at all. */
  isConfigured(): boolean;
  /** Why the provider is not configured, for honest UI reporting. */
  configurationHint(): string;

  getConnectionStatus(ref: CredentialRef): Promise<ConnectionState>;

  listFolders(ref: CredentialRef, parentId?: string, opts?: ListOptions): Promise<ListResult<RemoteFolder>>;
  listFiles(ref: CredentialRef, folderId?: string, opts?: ListOptions): Promise<ListResult<RemoteFile>>;
  searchFiles(ref: CredentialRef, query: string, opts?: ListOptions): Promise<ListResult<RemoteFile>>;

  getFileMetadata(ref: CredentialRef, fileId: string): Promise<RemoteFile>;
  downloadFile(ref: CredentialRef, fileId: string): Promise<DownloadedFile>;
}

export class ProviderNotConfiguredError extends Error {
  constructor(providerId: string, hint: string) {
    super(`${providerId} is not configured: ${hint}`);
    this.name = "ProviderNotConfiguredError";
  }
}

export class ProviderAuthError extends Error {
  readonly status: ConnectionStatus;
  constructor(message: string, status: ConnectionStatus = "needs_reauthorization") {
    super(message);
    this.name = "ProviderAuthError";
    this.status = status;
  }
}

/** Surface the provider's real status/body rather than a generic 500. */
export async function assertProviderResponse(res: Response, providerId: string): Promise<void> {
  if (res.ok) return;
  const body = await res.text();
  if (res.status === 401 || res.status === 403) {
    throw new ProviderAuthError(`${providerId} authorization failed [${res.status}]: ${body}`);
  }
  throw new Error(`${providerId} request failed [${res.status}]: ${body}`);
}
