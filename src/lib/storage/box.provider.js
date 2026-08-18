/**
 * BoxProvider — real Box Content API v2 access.
 *
 * AUTHENTICATION ARCHITECTURE:
 * This provider uses custom OAuth 2.0.
 * 1. Milestone generates a signed OAuth state token (HMAC-SHA256).
 * 2. User authorizes at Box.com.
 * 3. Callback route (/api/public/auth/callback) validates state.
 * 4. Milestone exchanges code for access/refresh tokens.
 * 5. Tokens are stored AES-256-GCM encrypted in the DB.
 */
import { assertProviderResponse, ProviderNotConfiguredError, } from "./storage-provider";
const BOX_API = "https://api.box.com/2.0";
const ITEM_FIELDS = "id,name,type,size,modified_at,shared_link,parent,extension";
function accessToken(ref) {
    if (ref.accessToken)
        return ref.accessToken;
    throw new ProviderNotConfiguredError("box", ref.scope === "organization"
        ? "no organization Box connection has been authorized"
        : "this member has not connected their Box account");
}
async function boxFetch(ref, path, params, init) {
    const url = new URL(`${BOX_API}${path}`);
    for (const [k, v] of Object.entries(params ?? {})) {
        if (v !== undefined && v !== null && v !== "")
            url.searchParams.set(k, String(v));
    }
    const res = await fetch(url.toString(), {
        ...init,
        headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${accessToken(ref)}` },
    });
    await assertProviderResponse(res, "box");
    return res;
}
function mapItem(raw) {
    const ext = raw["extension"] ? String(raw["extension"]).toLowerCase() : "";
    const mime = ext === "jpg" || ext === "jpeg"
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
export const boxProvider = {
    id: "box",
    displayName: "Box",
    isConfigured() {
        return Boolean(process.env["BOX_CLIENT_ID"] && process.env["BOX_CLIENT_SECRET"]);
    },
    configurationHint() {
        return "Register a Box developer app and save BOX_CLIENT_ID / BOX_CLIENT_SECRET to enable Box.";
    },
    async getConnectionStatus(ref) {
        if (!this.isConfigured()) {
            return { status: "disconnected", detail: this.configurationHint() };
        }
        try {
            const res = await boxFetch(ref, "/users/me", { fields: "login,name" });
            const json = (await res.json());
            return { status: "connected", accountEmail: json.login };
        }
        catch (err) {
            if (err?.name === "ProviderNotConfiguredError") {
                return { status: "disconnected", detail: err.message };
            }
            if (err?.name === "ProviderAuthError") {
                return { status: "needs_reauthorization", detail: err.message };
            }
            return { status: "error", detail: err?.message ?? "Unknown Box error" };
        }
    },
    async listFolders(ref, parentId, opts) {
        const res = await boxFetch(ref, `/folders/${encodeURIComponent(parentId ?? "0")}/items`, {
            fields: ITEM_FIELDS,
            limit: opts?.pageSize ?? 100,
            offset: opts?.pageToken,
        });
        const json = (await res.json());
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
        const json = (await res.json());
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
        const json = (await res.json());
        return { items: (json.entries ?? []).map(mapItem) };
    },
    async getFileMetadata(ref, fileId) {
        const res = await boxFetch(ref, `/files/${encodeURIComponent(fileId)}`, { fields: ITEM_FIELDS });
        return mapItem((await res.json()));
    },
    async downloadFile(ref, fileId) {
        const meta = await this.getFileMetadata(ref, fileId);
        const res = await boxFetch(ref, `/files/${encodeURIComponent(fileId)}/content`);
        return { bytes: await res.arrayBuffer(), mimeType: meta.mimeType, name: meta.name };
    },
};
