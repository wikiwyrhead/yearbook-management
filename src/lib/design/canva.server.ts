/**
 * Server-only Canva integration logic.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { openCredentials, sealCredentials } from "../storage/credentials.server";
import { canvaProvider } from "./canva.provider";
import type { DesignRef } from "./design-provider";

export async function readCanvaConnection(yearbookId: string) {
  const { data, error } = await supabaseAdmin
    .from("canva_integrations")
    .select("*")
    .eq("yearbook_id", yearbookId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const creds = openCredentials({
    accessToken: data.access_token_encrypted,
    refreshToken: data.refresh_token_encrypted,
  });
  const ref: DesignRef = { yearbookId, accessToken: creds.accessToken };
  const state = await canvaProvider.getConnectionStatus(ref);

  return {
    ...data,
    status: state.status,
    teamId: state.teamId,
    detail: state.detail,
    credentials: data, // Return the raw record for credential mapping in other functions
  };
}

export async function upsertCanvaConnection(data: {
  yearbookId: string;
  accessToken: string | null;
  refreshToken: string | null;
  expiresIn?: number;
}) {
  const credentials = sealCredentials({
    accessToken: data.accessToken ?? undefined,
    refreshToken: data.refreshToken ?? undefined,
  });

  const { error } = await supabaseAdmin.from("canva_integrations").upsert({
    yearbook_id: data.yearbookId,
    access_token_encrypted: credentials["accessToken"] ?? null,
    refresh_token_encrypted: credentials["refreshToken"] ?? null,
    updated_at: new Date().toISOString(),
  });

  if (error) throw error;
  return { success: true };
}

export async function deleteCanvaConnection(yearbookId: string) {
  const { error } = await supabaseAdmin
    .from("canva_integrations")
    .delete()
    .eq("yearbook_id", yearbookId);
  if (error) throw error;
  return { success: true };
}

export async function listDesigns(yearbookId: string, search?: string) {
  const connection = await readCanvaConnection(yearbookId);
  if (!connection) throw new Error("Canva is not connected for this yearbook.");

  const creds = openCredentials({
    accessToken: (connection as any).access_token_encrypted,
    refreshToken: (connection as any).refresh_token_encrypted,
  });
  const ref: DesignRef = { yearbookId, accessToken: creds.accessToken };
  return canvaProvider.listDesigns(ref, search);
}

export async function startProofExport(params: {
  yearbookId: string;
  pageId: string;
  designId: string;
  userId: string;
}) {
  const connection = await readCanvaConnection(params.yearbookId);
  if (!connection) throw new Error("Canva is not connected for this yearbook.");

  const creds = openCredentials({
    accessToken: (connection as any).access_token_encrypted,
    refreshToken: (connection as any).refresh_token_encrypted,
  });
  const ref: DesignRef = { yearbookId: params.yearbookId, accessToken: creds.accessToken };
  
  // 1. Request export from Canva
  const job = await canvaProvider.requestPdfExport(ref, params.designId);
  
  // 2. We could poll here or return the job ID for the client to poll.
  // Given we are in a server function, we might poll for a few seconds then return.
  return { jobId: job.id, status: job.status };
}
