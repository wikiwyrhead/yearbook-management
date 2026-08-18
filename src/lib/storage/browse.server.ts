/**
 * Server-only browsing and import execution for storage providers.
 */
import { getStorageProvider, resolveRef } from "./registry.server";
import type { StorageProviderId } from "./storage-provider";
import { importExternalFile } from "./import.server";

export async function browse(data: {
  userId: string;
  provider: StorageProviderId;
  scope: "organization" | "member";
  folderId?: string | undefined;
  search?: string | undefined;
}) {
  const provider = getStorageProvider(data.provider);
  const ref = await resolveRef(data.scope, data.provider, data.userId);

  if (data.search) {
    return provider.searchFiles(ref, data.search, { pageSize: 50 });
  }

  const [folders, files] = await Promise.all([
    provider.listFolders(ref, data.folderId, { pageSize: 100 }),
    provider.listFiles(ref, data.folderId, { pageSize: 100 }),
  ]);

  return {
    folders: folders.items,
    files: files.items,
    nextPageToken: files.nextPageToken || folders.nextPageToken,
  };
}

export async function runImport(data: {
  userId: string;
  yearbookId: string;
  provider: StorageProviderId;
  scope: "organization" | "member";
  fileIds: string[];
  folderId?: string;
  studentId?: string;
  sectionId?: string;
  category?: string;
  replacesAssetId?: string;
}) {
  const provider = getStorageProvider(data.provider);
  const ref = await resolveRef(data.scope, data.provider, data.userId);

  return executeImport({
    supabase: (await import("@/integrations/supabase/client.server")).supabaseAdmin,
    userId: data.userId,
    yearbookId: data.yearbookId,
    provider,
    ref,
    fileIds: data.fileIds,
    studentId: data.studentId,
    sectionId: data.sectionId,
    category: data.category,
    replacesAssetId: data.replacesAssetId,
  });
}
