/**
 * GoogleDriveProvider — Direct Google Drive API v3 (Standalone Mode).
 *
 * Uses direct Google Drive API v3 (https://www.googleapis.com/drive/v3)
 * with standard Google OAuth 2.0.
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

const GOOGLE_API = "https://www.googleapis.com/drive/v3";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const FILE_FIELDS =
  "id,name,mimeType,size,modifiedTime,webViewLink,thumbnailLink,parents";

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

async function driveFetch(
  ref: CredentialRef,
  path: string,
  params?: Record<string, string | number | undefined>,
  init?: RequestInit,
): Promise<Response> {
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

export const googleDriveProvider: StorageProvider = {
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
      name: exportMime === "application/pdf" && !meta.name.endsWith(".pdf")
        ? `${meta.name}.pdf`
        : meta.name,
    };
  },
};
