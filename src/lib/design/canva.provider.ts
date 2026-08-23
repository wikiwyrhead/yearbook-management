/**
 * CanvaProvider — Real Canva Connect API client (User-Scoped & PKCE-Protected).
 *
 * AUTHENTICATION ARCHITECTURE:
 * User-scoped OAuth 2.0 with PKCE S256:
 * 1. Milestone generates signed state (HMAC-SHA256).
 * 2. User authorizes at Canva.
 * 3. Shared callback route (/api/public/auth/callback) validates PKCE and exchanges code.
 * 4. Tokens are stored AES-256-GCM encrypted in public.canva_user_connections.
 * 5. Automatic rotating refresh token cycle on 401 response.
 */
import {
  DesignProviderNotConfiguredError,
  type DesignConnectionState,
  type DesignDocument,
  type DesignProvider,
  type DesignRef,
  type ExportJob,
} from "./design-provider.ts";

const CANVA_API = "https://api.canva.com/rest/v1";
const CANVA_TOKEN_URL = "https://api.canva.com/rest/v1/oauth/token";
const CANVA_REVOKE_URL = "https://api.canva.com/rest/v1/oauth/revoke";

function token(ref: DesignRef): string {
  if (ref.accessToken) return ref.accessToken;
  throw new DesignProviderNotConfiguredError(
    "canva",
    "No authorized Canva connection found for this user. Please connect your Canva account.",
  );
}

export async function canvaFetch(
  ref: DesignRef,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const currentToken = token(ref);

  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${currentToken}`);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let res = await fetch(`${CANVA_API}${path}`, {
    ...init,
    headers,
  });

  // Handle 401 Token Expiration with Automatic Rotating Refresh
  if (res.status === 401 && ref.refreshToken) {
    try {
      const refreshed = await refreshCanvaAccessToken(ref.refreshToken);
      ref.accessToken = refreshed.accessToken;
      if (ref.refreshToken) ref.refreshToken = refreshed.refreshToken || ref.refreshToken;

      // Update in database atomically if userId is present
      if (ref.userId) {
        const { updateCanvaUserCredentials } = await import("./canva.server.ts");
        await updateCanvaUserCredentials(ref.userId, {
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken ?? null,
          expiresIn: refreshed.expiresIn,
        });
      } else if (ref.connectionId) {
        const { sealCredentials } = await import("../storage/credentials.server.ts");
        const { getDbPool } = await import("../db/pool.server.ts");
        const sealed = sealCredentials({
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken || ref.refreshToken,
          expiresAt: new Date(Date.now() + refreshed.expiresIn * 1000).toISOString(),
        });
        await getDbPool().query(
          `UPDATE public.design_provider_connections
           SET encrypted_credentials = $1, expires_at = now() + ($2 || ' seconds')::interval, updated_at = now()
           WHERE id = $3`,
          [sealed, refreshed.expiresIn, ref.connectionId],
        );
      }

      const retryHeaders = new Headers(init?.headers);
      retryHeaders.set("Authorization", `Bearer ${ref.accessToken}`);
      if (!retryHeaders.has("Content-Type")) {
        retryHeaders.set("Content-Type", "application/json");
      }

      // Retry original request with fresh token
      res = await fetch(`${CANVA_API}${path}`, {
        ...init,
        headers: retryHeaders,
      });
    } catch (refreshErr) {
      console.error("[CanvaProvider] Token refresh failed:", refreshErr);
    }
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Canva request failed [${res.status}]: ${body}`);
  }
  return res;
}

export async function refreshCanvaAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
}> {
  const clientId = process.env["CANVA_CLIENT_ID"];
  const clientSecret = process.env["CANVA_CLIENT_SECRET"];
  if (!clientId || !clientSecret) {
    throw new Error("Canva client ID or secret not configured.");
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(CANVA_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Canva token refresh failed [${res.status}]: ${errText}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  const result: {
    accessToken: string;
    refreshToken?: string;
    expiresIn: number;
  } = {
    accessToken: data.access_token,
    expiresIn: data.expires_in,
  };
  if (data.refresh_token) {
    result.refreshToken = data.refresh_token;
  }

  return result;
}

export async function revokeCanvaToken(tokenOrRefreshToken: string): Promise<void> {
  const clientId = process.env["CANVA_CLIENT_ID"];
  const clientSecret = process.env["CANVA_CLIENT_SECRET"];
  if (!clientId || !clientSecret) return;

  try {
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    await fetch(CANVA_REVOKE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({
        token: tokenOrRefreshToken,
      }),
    });
  } catch (err) {
    console.warn("[CanvaProvider] Token revocation warning:", err);
  }
}

function mapDesign(raw: Record<string, any>): DesignDocument {
  const urls = raw["urls"] || {};
  const editUrl = urls["edit_url"] || `https://www.canva.com/design/${raw["id"]}/edit`;

  return {
    id: String(raw["id"]),
    canvaDesignId: String(raw["id"]),
    title: String(raw["title"] || raw["name"] || "Untitled Canva Design"),
    url: editUrl,
    thumbnailUrl: raw["thumbnail"]?.["url"] || raw["thumbnail_url"],
    pageCount: typeof raw["page_count"] === "number" ? raw["page_count"] : undefined,
    updatedAt: raw["updated_at"]
      ? typeof raw["updated_at"] === "number"
        ? new Date(raw["updated_at"] * 1000).toISOString()
        : new Date(raw["updated_at"]).toISOString()
      : undefined,
  };
}

function mapJob(raw: Record<string, any>): ExportJob {
  const job = raw["job"] || raw;
  const status = String(job["status"] || "in_progress").toLowerCase();
  const urls = Array.isArray(job["urls"])
    ? job["urls"].map(String)
    : typeof job["url"] === "string"
      ? [job["url"]]
      : undefined;

  return {
    id: String(job["id"]),
    status:
      status === "success" || status === "completed"
        ? "completed"
        : status === "failed"
          ? "failed"
          : "processing",
    downloadUrls: urls,
    error: job["error"]?.["message"] || job["error"]?.["code"],
  };
}

export const canvaProvider: DesignProvider = {
  id: "canva",
  displayName: "Canva",

  isConfigured() {
    return Boolean(process.env["CANVA_CLIENT_ID"] && process.env["CANVA_CLIENT_SECRET"]);
  },

  configurationHint() {
    return "Register a Canva Connect app and configure CANVA_CLIENT_ID / CANVA_CLIENT_SECRET.";
  },

  async getConnectionStatus(ref: DesignRef): Promise<DesignConnectionState> {
    if (!this.isConfigured()) {
      return { status: "disconnected", detail: this.configurationHint() };
    }
    try {
      const meRes = await canvaFetch(ref, "/users/me");
      const meJson = (await meRes.json()) as { team_user?: { team_id?: string; user_id?: string } };

      let displayName: string | undefined;
      try {
        const profileRes = await canvaFetch(ref, "/users/me/profile");
        const profileJson = (await profileRes.json()) as { profile?: { display_name?: string } };
        displayName = profileJson.profile?.display_name;
      } catch {
        // Profile endpoint is optional
      }

      return {
        status: "connected",
        teamId: meJson.team_user?.team_id,
        userId: meJson.team_user?.user_id,
        accountName: displayName,
      };
    } catch (err: any) {
      if (err?.name === "DesignProviderNotConfiguredError") {
        return { status: "disconnected", detail: err.message };
      }
      if (String(err?.message ?? "").includes("[401]")) {
        return { status: "needs_reauthorization", detail: err.message };
      }
      return { status: "error", detail: err?.message ?? "Unknown Canva error" };
    }
  },

  async getDesign(ref: DesignRef, designId: string): Promise<DesignDocument> {
    const res = await canvaFetch(ref, `/designs/${encodeURIComponent(designId)}`);
    const json = (await res.json()) as { design?: Record<string, any> };
    return mapDesign(json.design || {});
  },

  async listDesigns(ref: DesignRef, query?: string): Promise<DesignDocument[]> {
    const suffix = query ? `?query=${encodeURIComponent(query)}` : "";
    const res = await canvaFetch(ref, `/designs${suffix}`);
    const json = (await res.json()) as { items?: Record<string, any>[] };
    return (json.items || []).map(mapDesign);
  },

  async requestPdfExport(ref: DesignRef, designId: string, pages?: number[]): Promise<ExportJob> {
    const format: Record<string, any> = { type: "pdf" };
    if (pages && pages.length > 0) {
      format["pages"] = pages;
    }
    const res = await canvaFetch(ref, "/exports", {
      method: "POST",
      body: JSON.stringify({
        design_id: designId,
        format,
      }),
    });
    return mapJob((await res.json()) as Record<string, any>);
  },

  async getExportStatus(ref: DesignRef, jobId: string): Promise<ExportJob> {
    const res = await canvaFetch(ref, `/exports/${encodeURIComponent(jobId)}`);
    return mapJob((await res.json()) as Record<string, any>);
  },
};

/**
 * Upload an approved asset binary stream to the user's Canva account.
 */
export async function uploadAssetToCanva(
  ref: DesignRef,
  fileName: string,
  _mimeType: string,
  bytes: Buffer | Uint8Array,
): Promise<{ id: string; name: string }> {
  const meta = JSON.stringify({
    name_base64: Buffer.from(fileName, "utf8").toString("base64"),
  });

  const res = await canvaFetch(ref, "/asset-uploads", {
    method: "POST",
    headers: {
      "Asset-Upload-Metadata": meta,
      "Content-Type": "application/octet-stream",
    },
    body: new Uint8Array(bytes),
  });

  const json = (await res.json()) as {
    job?: { id: string; status: string; asset?: { id: string; name: string } };
    asset?: { id: string; name: string };
  };

  const assetId = json.asset?.id || json.job?.asset?.id || json.job?.id || "asset_uploaded";
  const name = json.asset?.name || json.job?.asset?.name || fileName;
  return { id: assetId, name };
}
