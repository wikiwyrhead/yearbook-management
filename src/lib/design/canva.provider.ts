/**
 * CanvaProvider — real Canva Connect API client.
 *
 * AUTHENTICATION ARCHITECTURE:
 * This provider uses custom OAuth 2.0 with PKCE.
 * 1. Milestone generates signed state.
 * 2. Callback route exchanges code for tokens.
 * 3. Tokens stored encrypted at the yearbook level.
 */
import {
  DesignProviderNotConfiguredError,
  type DesignConnectionState,
  type DesignDocument,
  type DesignProvider,
  type DesignRef,
  type ExportJob,
} from "./design-provider";

const CANVA_API = "https://api.canva.com/rest/v1";

function token(ref: DesignRef): string {
  if (ref.accessToken) return ref.accessToken;
  throw new DesignProviderNotConfiguredError(
    "canva",
    "this yearbook has no authorized Canva connection",
  );
}

async function canvaFetch(
  ref: DesignRef,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(`${CANVA_API}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token(ref)}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Canva request failed [${res.status}]: ${body}`);
  }
  return res;
}

function mapDesign(raw: Record<string, any>): DesignDocument {
  return {
    id: String(raw["id"]),
    title: String(raw["title"] ?? "Untitled design"),
    url: String(raw["urls"]?.["view_url"] ?? `https://www.canva.com/design/${raw["id"]}/view`),
    thumbnailUrl: raw["thumbnail"]?.["url"],
    updatedAt: raw["updated_at"] ? new Date(Number(raw["updated_at"]) * 1000).toISOString() : undefined,
  };
}

function mapJob(raw: Record<string, any>): ExportJob {
  const job = raw["job"] ?? raw;
  const status = String(job["status"] ?? "in_progress");
  return {
    id: String(job["id"]),
    status: status === "success" ? "completed" : status === "failed" ? "failed" : "processing",
    downloadUrls: Array.isArray(job["urls"]) ? job["urls"].map(String) : undefined,
    error: job["error"]?.["message"],
  };
}

export const canvaProvider: DesignProvider = {
  id: "canva",
  displayName: "Canva",

  isConfigured() {
    return Boolean(process.env["CANVA_CLIENT_ID"] && process.env["CANVA_CLIENT_SECRET"]);
  },

  configurationHint() {
    return "Register a Canva Connect app and save CANVA_CLIENT_ID / CANVA_CLIENT_SECRET to enable Canva.";
  },

  async getConnectionStatus(ref: DesignRef): Promise<DesignConnectionState> {
    if (!this.isConfigured()) {
      return { status: "disconnected", detail: this.configurationHint() };
    }
    try {
      const res = await canvaFetch(ref, "/users/me");
      const json = (await res.json()) as { team_user?: { team_id?: string; user_id?: string } };
      return { status: "connected", teamId: json.team_user?.team_id };
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

  async getDesign(ref, designId) {
    const res = await canvaFetch(ref, `/designs/${encodeURIComponent(designId)}`);
    const json = (await res.json()) as { design?: Record<string, any> };
    return mapDesign(json.design ?? {});
  },

  async listDesigns(ref, query) {
    const suffix = query ? `?query=${encodeURIComponent(query)}` : "";
    const res = await canvaFetch(ref, `/designs${suffix}`);
    const json = (await res.json()) as { items?: Record<string, any>[] };
    return (json.items ?? []).map(mapDesign);
  },

  async requestPdfExport(ref, designId) {
    const res = await canvaFetch(ref, "/exports", {
      method: "POST",
      body: JSON.stringify({ design_id: designId, format: { type: "pdf" } }),
    });
    return mapJob((await res.json()) as Record<string, any>);
  },

  async getExportStatus(ref, jobId) {
    const res = await canvaFetch(ref, `/exports/${encodeURIComponent(jobId)}`);
    return mapJob((await res.json()) as Record<string, any>);
  },
};
