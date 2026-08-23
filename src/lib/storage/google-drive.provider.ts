/**
 * GoogleDriveProvider — Direct Google Drive API v3 (Standalone & Center Scoped).
 *
 * Uses direct Google Drive API v3 (https://www.googleapis.com/drive/v3)
 * with standard Google OAuth 2.0 and drive.file scope.
 */
import {
  assertProviderResponse,
  ProviderNotConfiguredError,
  ProviderAuthError,
  type ConnectionState,
  type CredentialRef,
  type DownloadedFile,
  type ListOptions,
  type ListResult,
  type RemoteFile,
  type RemoteFolder,
  type StorageProvider,
} from "./storage-provider.ts";

const GOOGLE_API = "https://www.googleapis.com/drive/v3";
const GOOGLE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const FILE_FIELDS = "id,name,mimeType,size,modifiedTime,webViewLink,thumbnailLink,parents,trashed";

/** Google Workspace editor files must be exported, not downloaded directly. */
const GOOGLE_EXPORT_MAP: Record<string, string> = {
  "application/vnd.google-apps.document": "application/pdf",
  "application/vnd.google-apps.spreadsheet": "application/pdf",
  "application/vnd.google-apps.presentation": "application/pdf",
  "application/vnd.google-apps.drawing": "image/png",
};

function isStandalone(): boolean {
  return Boolean(process.env["GOOGLE_CLIENT_ID"] && process.env["GOOGLE_CLIENT_SECRET"]);
}

export async function refreshGoogleAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  expiresIn: number;
  scope?: string;
}> {
  const clientId = process.env["GOOGLE_CLIENT_ID"];
  const clientSecret = process.env["GOOGLE_CLIENT_SECRET"];
  if (!clientId || !clientSecret) {
    throw new ProviderNotConfiguredError(
      "google_drive",
      "GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing.",
    );
  }

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new ProviderAuthError(`Google token refresh failed [${res.status}]: ${errorBody}`);
  }

  const json = (await res.json()) as { access_token: string; expires_in: number; scope?: string };
  const result: { accessToken: string; expiresIn: number; scope?: string } = {
    accessToken: json.access_token,
    expiresIn: json.expires_in,
  };
  if (json.scope !== undefined) result.scope = json.scope;
  return result;
}

export async function revokeGoogleToken(token: string): Promise<boolean> {
  try {
    const res = await fetch(GOOGLE_REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function driveFetch(
  ref: CredentialRef,
  path: string,
  params?: Record<string, string | number | undefined>,
  init?: RequestInit,
  isRetry = false,
): Promise<Response> {
  // Check token expiration if available
  if (
    ref.expiresAt &&
    new Date(ref.expiresAt).getTime() < Date.now() + 60000 &&
    ref.refreshToken &&
    !isRetry
  ) {
    try {
      const refreshed = await refreshGoogleAccessToken(ref.refreshToken);
      ref.accessToken = refreshed.accessToken;
      ref.expiresAt = new Date(Date.now() + refreshed.expiresIn * 1000).toISOString();
      // Persist refreshed credentials in background if center ref
      if (ref.scope === "center") {
        const { updateCenterCredentials } = await import("./settings.server");
        await updateCenterCredentials(ref.centerId, "google_drive", {
          accessToken: ref.accessToken,
          refreshToken: ref.refreshToken,
          expiresAt: ref.expiresAt,
        }).catch((err: unknown) =>
          console.error("[GoogleDrive] Failed to persist refreshed token:", err),
        );
      }
    } catch (refreshErr) {
      console.warn("[GoogleDrive] Proactive token refresh failed:", refreshErr);
    }
  }

  if (!ref.accessToken) {
    throw new ProviderNotConfiguredError("google_drive", "Access token missing for Google Drive.");
  }

  const url = new URL(`${GOOGLE_API}${path}`);
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }

  const res = await fetch(url.toString(), {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${ref.accessToken}`,
    },
  });

  if (res.status === 401 && ref.refreshToken && !isRetry) {
    // Retry once with refreshed token
    try {
      const refreshed = await refreshGoogleAccessToken(ref.refreshToken);
      ref.accessToken = refreshed.accessToken;
      ref.expiresAt = new Date(Date.now() + refreshed.expiresIn * 1000).toISOString();

      if (ref.scope === "center") {
        const { updateCenterCredentials } = await import("./settings.server");
        await updateCenterCredentials(ref.centerId, "google_drive", {
          accessToken: ref.accessToken,
          refreshToken: ref.refreshToken,
          expiresAt: ref.expiresAt,
        }).catch((err: unknown) =>
          console.error("[GoogleDrive] Failed to persist refreshed token:", err),
        );
      }

      return driveFetch(ref, path, params, init, true);
    } catch (refreshErr) {
      throw new ProviderAuthError(
        `Google Drive access token expired and refresh failed: ${refreshErr}`,
      );
    }
  }

  await assertProviderResponse(res, "google_drive");
  return res;
}

function mapFile(raw: Record<string, any>): RemoteFile {
  return {
    id: String(raw["id"]),
    name: String(raw["name"] ?? "Untitled"),
    mimeType: String(raw["mimeType"] ?? "application/octet-stream"),
    size: raw["size"] ? Number(raw["size"]) : undefined,
    modifiedAt: raw["modifiedTime"],
    webUrl: raw["webViewLink"],
    thumbnailUrl: raw["thumbnailLink"],
    parentId: Array.isArray(raw["parents"]) ? raw["parents"][0] : undefined,
  };
}

/** Escape a value for a Drive `q` string literal. */
function escapeQ(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function query(
  ref: CredentialRef,
  q: string,
  opts?: ListOptions,
): Promise<ListResult<RemoteFile>> {
  const res = await driveFetch(ref, "/files", {
    q,
    fields: `nextPageToken,files(${FILE_FIELDS})`,
    pageSize: opts?.pageSize ?? 100,
    pageToken: opts?.pageToken,
    orderBy: "folder,name",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  });
  const json = (await res.json()) as { files?: Record<string, any>[]; nextPageToken?: string };
  return {
    items: (json.files ?? []).map(mapFile),
    nextPageToken: json.nextPageToken,
  };
}

export const googleDriveProvider: StorageProvider & {
  createFolder: (ref: CredentialRef, name: string, parentId?: string) => Promise<RemoteFolder>;
  getOrCreateFolder: (ref: CredentialRef, name: string, parentId?: string) => Promise<RemoteFolder>;
  getOrCreatePath: (
    ref: CredentialRef,
    pathParts: string[],
    rootParentId?: string,
  ) => Promise<RemoteFolder>;
  setupYearbookFolders: (
    ref: CredentialRef,
    centerName: string,
    yearbookTitle: string,
    rootFolderId?: string,
  ) => Promise<{
    rootFolderId: string;
    centerFolderId: string;
    yearbookFolderId: string;
    assetsFolderId: string;
    portraitsFolderId: string;
    proofsFolderId: string;
    productionFolderId: string;
  }>;
  verifyFolderAccess: (
    ref: CredentialRef,
    folderId: string,
  ) => Promise<{
    id: string;
    name: string;
    isFolder: boolean;
    trashed: boolean;
    canWrite: boolean;
    webViewLink?: string;
  }>;
  uploadFile: (
    ref: CredentialRef,
    folderId: string,
    name: string,
    mimeType: string,
    bytes: ArrayBuffer | Uint8Array,
  ) => Promise<RemoteFile>;
  deleteFile: (ref: CredentialRef, fileId: string) => Promise<boolean>;
} = {
  id: "google_drive",
  displayName: "Google Drive",

  isConfigured() {
    return isStandalone();
  },

  configurationHint() {
    return "Direct Google Drive API v3 configured via GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.";
  },

  async getConnectionStatus(ref: CredentialRef): Promise<ConnectionState> {
    try {
      const res = await driveFetch(ref, "/about", { fields: "user(emailAddress,displayName)" });
      const json = (await res.json()) as { user?: { emailAddress?: string } };
      return { status: "connected", accountEmail: json.user?.emailAddress };
    } catch (err: any) {
      if (err?.name === "ProviderNotConfiguredError") {
        return { status: "disconnected", detail: err.message };
      }
      if (err?.name === "ProviderAuthError") {
        return { status: "needs_reauthorization", detail: err.message };
      }
      return { status: "error", detail: err?.message ?? "Unknown Google Drive error" };
    }
  },

  async listFolders(ref, parentId, opts): Promise<ListResult<RemoteFolder>> {
    const parent = parentId ? escapeQ(parentId) : "root";
    const result = await query(
      ref,
      `'${parent}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`,
      opts,
    );
    return {
      items: result.items.map((f) => ({ id: f.id, name: f.name, parentId })),
      nextPageToken: result.nextPageToken,
    };
  },

  async listFiles(ref, folderId, opts) {
    const parent = folderId ? escapeQ(folderId) : "root";
    return query(
      ref,
      `'${parent}' in parents and mimeType != '${FOLDER_MIME}' and trashed = false`,
      opts,
    );
  },

  async searchFiles(ref, q, opts) {
    return query(
      ref,
      `name contains '${escapeQ(q)}' and mimeType != '${FOLDER_MIME}' and trashed = false`,
      opts,
    );
  },

  async getFileMetadata(ref, fileId) {
    const res = await driveFetch(ref, `/files/${encodeURIComponent(fileId)}`, {
      fields: FILE_FIELDS,
      supportsAllDrives: "true",
    });
    return mapFile((await res.json()) as Record<string, any>);
  },

  async downloadFile(ref, fileId): Promise<DownloadedFile> {
    const meta = await this.getFileMetadata(ref, fileId);
    const exportMime = GOOGLE_EXPORT_MAP[meta.mimeType];

    const res = exportMime
      ? await driveFetch(ref, `/files/${encodeURIComponent(fileId)}/export`, {
          mimeType: exportMime,
        })
      : await driveFetch(ref, `/files/${encodeURIComponent(fileId)}`, {
          alt: "media",
          supportsAllDrives: "true",
        });

    return {
      bytes: await res.arrayBuffer(),
      mimeType: exportMime ?? meta.mimeType,
      name:
        exportMime === "application/pdf" && !meta.name.endsWith(".pdf")
          ? `${meta.name}.pdf`
          : meta.name,
    };
  },

  async createFolder(ref, name, parentId): Promise<RemoteFolder> {
    const body: Record<string, any> = {
      name,
      mimeType: FOLDER_MIME,
    };
    if (parentId && parentId !== "root") {
      body["parents"] = [parentId];
    }
    const res = await driveFetch(
      ref,
      "/files",
      { fields: "id,name,parents" },
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const json = (await res.json()) as { id: string; name: string; parents?: string[] };
    return { id: json.id, name: json.name, parentId };
  },

  async getOrCreateFolder(ref, name, parentId): Promise<RemoteFolder> {
    const parent = parentId ? escapeQ(parentId) : "root";
    const existing = await query(
      ref,
      `'${parent}' in parents and name = '${escapeQ(name)}' and mimeType = '${FOLDER_MIME}' and trashed = false`,
      { pageSize: 1 },
    );
    if (existing.items.length > 0 && existing.items[0]) {
      return { id: existing.items[0].id, name: existing.items[0].name, parentId };
    }
    return this.createFolder(ref, name, parentId);
  },

  async getOrCreatePath(ref, pathParts, rootParentId): Promise<RemoteFolder> {
    let currentParentId = rootParentId;
    let currentFolder: RemoteFolder = { id: rootParentId || "root", name: "root" };
    for (const part of pathParts) {
      if (!part || !part.trim()) continue;
      currentFolder = await this.getOrCreateFolder(ref, part.trim(), currentParentId);
      currentParentId = currentFolder.id;
    }
    return currentFolder;
  },

  async verifyFolderAccess(
    ref: CredentialRef,
    folderId: string,
  ): Promise<{
    id: string;
    name: string;
    isFolder: boolean;
    trashed: boolean;
    canWrite: boolean;
    webViewLink?: string;
  }> {
    const res = await driveFetch(ref, `/files/${encodeURIComponent(folderId)}`, {
      fields: "id,name,mimeType,trashed,webViewLink,capabilities(canAddChildren,canEdit)",
      supportsAllDrives: "true",
    });
    const raw = (await res.json()) as Record<string, any>;
    const isFolder = raw["mimeType"] === FOLDER_MIME;
    const trashed = Boolean(raw["trashed"]);
    const caps = (raw["capabilities"] as Record<string, any>) || {};
    const canWrite = Boolean(
      caps["canAddChildren"] ?? caps["canUpload"] ?? caps["canEdit"] ?? true,
    );
    return {
      id: String(raw["id"]),
      name: String(raw["name"] || "Authoritative Drive Root"),
      isFolder,
      trashed,
      canWrite,
      webViewLink: raw["webViewLink"],
    };
  },

  async setupYearbookFolders(ref, centerName, yearbookTitle, rootFolderId) {
    if (rootFolderId) {
      // Direct Authoritative Root mode: create or reuse Yearbook folder directly inside rootFolderId
      const yearbookFolder = await this.getOrCreateFolder(ref, yearbookTitle, rootFolderId);
      const [assets, portraits, proofs, production] = await Promise.all([
        this.getOrCreateFolder(ref, "Assets", yearbookFolder.id),
        this.getOrCreateFolder(ref, "Portraits", yearbookFolder.id),
        this.getOrCreateFolder(ref, "Proofs", yearbookFolder.id),
        this.getOrCreateFolder(ref, "Production", yearbookFolder.id),
      ]);

      return {
        rootFolderId,
        centerFolderId: rootFolderId,
        yearbookFolderId: yearbookFolder.id,
        assetsFolderId: assets.id,
        portraitsFolderId: portraits.id,
        proofsFolderId: proofs.id,
        productionFolderId: production.id,
      };
    }

    // Default container mode: Milestone Yearbook / <Center Name> / <Yearbook Title>
    const rootFolder = await this.getOrCreateFolder(ref, "Milestone Yearbook");
    const centerFolder = await this.getOrCreateFolder(ref, centerName, rootFolder.id);
    const yearbookFolder = await this.getOrCreateFolder(ref, yearbookTitle, centerFolder.id);

    const [assets, portraits, proofs, production] = await Promise.all([
      this.getOrCreateFolder(ref, "Assets", yearbookFolder.id),
      this.getOrCreateFolder(ref, "Portraits", yearbookFolder.id),
      this.getOrCreateFolder(ref, "Proofs", yearbookFolder.id),
      this.getOrCreateFolder(ref, "Production", yearbookFolder.id),
    ]);

    return {
      rootFolderId: rootFolder.id,
      centerFolderId: centerFolder.id,
      yearbookFolderId: yearbookFolder.id,
      assetsFolderId: assets.id,
      portraitsFolderId: portraits.id,
      proofsFolderId: proofs.id,
      productionFolderId: production.id,
    };
  },

  async uploadFile(ref, folderId, name, mimeType, bytes): Promise<RemoteFile> {
    if (!ref.accessToken) throw new ProviderNotConfiguredError("google_drive", "No access token");
    const metadata = {
      name,
      parents: folderId ? [folderId] : undefined,
    };

    const boundary = `-------314159265358979323846`;
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const metaPart = `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}`;
    const mediaHeader = `${delimiter}Content-Type: ${mimeType}\r\n\r\n`;

    const metaBuffer = Buffer.from(metaPart, "utf8");
    const mediaHeaderBuffer = Buffer.from(mediaHeader, "utf8");
    const dataBuffer = Buffer.isBuffer(bytes)
      ? bytes
      : bytes instanceof Uint8Array
        ? Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
        : Buffer.from(bytes);
    const closeBuffer = Buffer.from(closeDelimiter, "utf8");

    const multipartBody = Buffer.concat([metaBuffer, mediaHeaderBuffer, dataBuffer, closeBuffer]);

    const res = await fetch(GOOGLE_UPLOAD_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ref.accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
        "Content-Length": String(multipartBody.length),
      },
      body: new Uint8Array(multipartBody),
    });

    await assertProviderResponse(res, "google_drive");
    const json = (await res.json()) as Record<string, any>;
    return mapFile(json);
  },

  async deleteFile(ref, fileId): Promise<boolean> {
    try {
      const res = await driveFetch(
        ref,
        `/files/${encodeURIComponent(fileId)}`,
        {},
        {
          method: "DELETE",
        },
      );
      return res.ok;
    } catch {
      return false;
    }
  },
};
