/**
 * Phase 6 — DesignProvider abstraction.
 *
 * The Design Workspace talks to this interface, never to Canva directly, so a
 * second design platform can be added without touching the proof workflow.
 */
export type DesignProviderId = "canva";

export type DesignConnectionStatus =
  "connected" | "needs_reauthorization" | "disconnected" | "error";

export type DesignConnectionState = {
  status: DesignConnectionStatus;
  detail?: string | undefined;
  teamId?: string | undefined;
  accountName?: string | undefined;
  userId?: string | undefined;
  scopes?: string[] | undefined;
};

export type DesignRef = {
  /** User-scoped credential lookup; tokens never leave the server. */
  userId?: string | undefined;
  connectionId?: string | undefined;
  yearbookId?: string | undefined;
  accessToken?: string | undefined;
  refreshToken?: string | undefined;
  accountEmail?: string | undefined;
  displayName?: string | undefined;
};

export type DesignDocument = {
  id: string;
  title: string;
  url: string;
  thumbnailUrl?: string | undefined;
  updatedAt?: string | undefined;
  canvaDesignId?: string | undefined;
  pageCount?: number | undefined;
};

export type ExportJob = {
  id: string;
  status: "processing" | "completed" | "failed";
  /** Provider download URLs are short-lived — always copy into Milestone storage. */
  downloadUrls?: string[] | undefined;
  error?: string | undefined;
};

export interface DesignProvider {
  readonly id: DesignProviderId;
  readonly displayName: string;

  isConfigured(): boolean;
  configurationHint(): string;

  getConnectionStatus(ref: DesignRef): Promise<DesignConnectionState>;

  getDesign(ref: DesignRef, designId: string): Promise<DesignDocument>;
  listDesigns(ref: DesignRef, query?: string): Promise<DesignDocument[]>;

  requestPdfExport(ref: DesignRef, designId: string, pages?: number[]): Promise<ExportJob>;
  getExportStatus(ref: DesignRef, jobId: string): Promise<ExportJob>;
}

export class DesignProviderNotConfiguredError extends Error {
  constructor(providerId: string, hint: string) {
    super(`${providerId} is not configured: ${hint}`);
    this.name = "DesignProviderNotConfiguredError";
  }
}
