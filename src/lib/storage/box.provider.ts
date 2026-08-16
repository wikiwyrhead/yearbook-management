/**
 * BoxProvider — real Box Content API v2 access.
 *
 * Box has no Lovable managed connector, so this provider calls api.box.com
 * directly with an OAuth 2.0 access token held server-side in
 * organization_storage_connections.credentials / member_storage_connections.credentials.
 *
 * Verified against the current Box Content API v2 reference:
 *  GET /2.0/folders/{id}/items (fields, limit, offset)
 *  GET /2.0/files/{id}
 *  GET /2.0/files/{id}/content (302 -> download)
 *  GET /2.0/search (query, type, limit, offset)
 *  GET /2.0/users/me
 *
 * Until a Box developer app (client id/secret) is registered, isConfigured()
 * is false and every call reports "disconnected" rather than returning fake data.
 */
import {
  assertProviderResponse,
  ProviderNotConfiguredError,
  type ConnectionState,
  type CredentialRef,
  type DownloadedFile,
  type ListOptions,
  type ListResult,
  type RemoteFile,
  type RemoteFolder,
  type StorageProvider,
} from "./storage-provider";

const BOX_API = "https://api.box.com/2.0";
const ITEM_FIELDS = "id,name,type,size,modified_at,shared_link,parent,extension";

function accessToken(ref: CredentialRef): string {
  if (ref.accessToken) return ref.accessToken;
  throw new ProviderNotConfiguredError(
    "box",
    ref.scope === "organization"
      ? "no organization Box connection has been authorized"
      : "this member has not connected their Box account",
  );
}

async function boxFetch(
  ref: CredentialRef,
  path: string,
  params?: Record<string, string | number | undefined>,
  init?: RequestInit,
): Promise<Response> {
  const url = new URL(`${BOX_API}${path}`);
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString(), {
    ...init,
    headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${accessToken(ref)}` },
  });
  await assertProviderResponse(res, "box");
  return res;
}

function mapItem(raw: Record<string, any>): RemoteFile {
  const ext = raw["extension"] ? String(raw["extension"]).toLowerCase() : "";
  const mime =
    ext === "jpg" || ext === "jpeg"
      ? "image/jpeg"
      : ext === "png"
        ? "image/png"
        : ext === "pdf"
          ? "application/pdf"
          : "application/octet-stream";
  return {
    id: String(raw["id"]),
    name: String(raw["name"] ?? "Untitled"),
    mimeType: mime,
    size: raw["size"] ? Number(raw["size"]) : undefined,
    modifiedAt: raw["modified_at"],
    webUrl: raw["shared_link"]?.url,
    parentId: raw["parent"]?.id,
  };
}

export const boxProvider: StorageProvider = {
  id: "box",
  displayName: "Box",

  isConfigured() {
    return Boolean(process.env["BOX_CLIENT_ID"] && process.env["BOX_CLIENT_SECRET"]);
  },

  configurationHint() {
    return "Register a Box developer app and save BOX_CLIENT_ID / BOX_CLIENT_SECRET to enable Box.";
  },

  async getConnectionStatus(ref: CredentialRef): Promise<ConnectionState> {
    if (!this.isConfigured()) {
      return { status: "disconnected", detail: this.configurationHint() };
    }
    try {
      const res = await boxFetch(ref, "/users/me", { fields: "login,name" });
      const json = (await res.json()) as { login?: string };
      return { status: "connected", accountEmail: json.login };
    } catch (err: any) {
      if (err?.name === "ProviderNotConfiguredError") {
        return { status: "disconnected", detail: err.message };
      }
      if (err?.name === "ProviderAuthError") {
        return { status: "needs_reauthorization", detail: err.message };
      }
      return { status: "error", detail: err?.message ?? "Unknown Box error" };
    }
  },

  async listFolders(ref, parentId, opts): Promise<ListResult<RemoteFolder>> {
    const res = await boxFetch(ref, `/folders/${encodeURIComponent(parentId ?? "0")}/items`, {
      fields: ITEM_FIELDS,
      limit: opts?.pageSize ?? 100,
      offset: opts?.pageToken,
    });
    const json = (await res.json()) as { entries?: Record<string, any>[] };
    return {
      items: (json.entries ?? [])
        .filter((e) => e["type"] === "folder")
        .map((e) => ({ id: String(e["id"]), name: String(e["name"]), parentId })),
    };
  },

  async listFiles(ref, folderId, opts) {
    const res = await boxFetch(ref, `/folders/${encodeURIComponent(folderId ?? "0")}/items`, {
      fields: ITEM_FIELDS,
      limit: opts?.pageSize ?? 100,
      offset: opts?.pageToken,
    });
    const json = (await res.json()) as { entries?: Record<string, any>[] };
    return {
      items: (json.entries ?? []).filter((e) => e["type"] === "file").map(mapItem),
    };
  },

  async searchFiles(ref, q, opts) {
    const res = await boxFetch(ref, "/search", {
      query: q,
      type: "file",
      fields: ITEM_FIELDS,
      limit: opts?.pageSize ?? 100,
      offset: opts?.pageToken,
    });
    const json = (await res.json()) as { entries?: Record<string, any>[] };
    return { items: (json.entries ?? []).map(mapItem) };
  },

  async getFileMetadata(ref, fileId) {
    const res = await boxFetch(ref, `/files/${encodeURIComponent(fileId)}`, { fields: ITEM_FIELDS });
    return mapItem((await res.json()) as Record<string, any>);
  },

  async downloadFile(ref, fileId): Promise<DownloadedFile> {
    const meta = await this.getFileMetadata(ref, fileId);
    const res = await boxFetch(ref, `/files/${encodeURIComponent(fileId)}/content`);
    return { bytes: await res.arrayBuffer(), mimeType: meta.mimeType, name: meta.name };
  },
};
