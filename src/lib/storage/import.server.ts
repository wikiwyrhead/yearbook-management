/**
 * Import orchestrator — the single place where an external file becomes a
 * controlled Milestone asset.
 *
 * Milestone is the source of truth: the bytes are copied into the yearbook's
 * protected storage and an asset version row is created. If the original
 * Drive/Box file is later renamed, moved or deleted, the Milestone asset is
 * unaffected. External changes never mutate an existing asset silently — a new
 * import always produces a NEW version.
 */
import { getStorageProvider } from "./registry.server";
import type { CredentialRef, StorageProviderId } from "./storage-provider";

const BUCKET = "yearbook_assets";

function assetTypeFor(mimeType: string, name: string): string {
  if (mimeType.startsWith("image/")) return "photo";
  if (mimeType === "application/pdf" || name.toLowerCase().endsWith(".pdf")) return "pdf";
  if (mimeType.startsWith("text/") || mimeType.includes("word") || mimeType.includes("document")) {
    return "document";
  }
  return "other";
}

function sanitize(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 180);
}

export type ImportParams = {
  yearbookId: string;
  provider: StorageProviderId;
  ref: CredentialRef;
  fileId: string;
  userId: string;
  folderId?: string | undefined;
  studentId?: string | undefined;
  sectionId?: string | undefined;
  category?: string | undefined;
  /** When set, the new asset becomes the next version of this asset lineage. */
  replacesAssetId?: string | undefined;
};

export async function importExternalFile(params: ImportParams) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const provider = getStorageProvider(params.provider);

  const meta = await provider.getFileMetadata(params.ref, params.fileId);
  const file = await provider.downloadFile(params.ref, params.fileId);

  const storagePath = `yearbooks/${params.yearbookId}/assets/${Date.now()}-${sanitize(file.name)}`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(storagePath, new Uint8Array(file.bytes), {
      contentType: file.mimeType,
      upsert: false,
    });
  if (uploadError) throw new Error(`Failed to store imported file: ${uploadError.message}`);

  // Versioning: supersede the previous current version of this lineage.
  let version = 1;
  if (params.replacesAssetId) {
    const { data: prev } = await supabaseAdmin
      .from("assets")
      .select("version")
      .eq("id", params.replacesAssetId)
      .maybeSingle();
    version = ((prev as any)?.version ?? 0) + 1;
    await supabaseAdmin
      .from("assets")
      .update({ is_current: false })
      .eq("id", params.replacesAssetId);
  }

  const now = new Date().toISOString();
  const { data: asset, error } = await supabaseAdmin
    .from("assets")
    .insert({
      yearbook_id: params.yearbookId,
      asset_type: assetTypeFor(file.mimeType, file.name) as any,
      file_name: file.name,
      file_type: file.mimeType,
      file_size: file.bytes.byteLength,
      storage_provider: params.provider as any,
      storage_path: storagePath,
      version,
      is_current: true,
      status: "uploaded" as any,
      uploaded_by: params.userId,
      student_id: params.studentId ?? null,
      section_id: params.sectionId ?? null,
      category: params.category ?? null,
      external_file_id: meta.id,
      external_folder_id: params.folderId ?? meta.parentId ?? null,
      external_url: meta.webUrl ?? null,
      external_filename: meta.name,
      source_metadata: {
        provider: params.provider,
        scope: params.ref.scope,
        mime_type: meta.mimeType,
        remote_modified_at: meta.modifiedAt ?? null,
      },
      imported_at: now,
      last_synced_at: now,
    } as any)
    .select()
    .single();

  if (error) throw new Error(error.message);

  await supabaseAdmin.from("asset_audit_log").insert({
    asset_id: (asset as any).id,
    yearbook_id: params.yearbookId,
    action: params.replacesAssetId ? "imported_new_version" : "imported",
    performed_by: params.userId,
    new_status: "uploaded" as any,
    metadata: {
      provider: params.provider,
      scope: params.ref.scope,
      external_file_id: meta.id,
      external_filename: meta.name,
    },
  } as any);

  return asset;
}
