/**
 * Server-only browsing and import execution for storage providers.
 */
import { getStorageProvider, resolveRef } from "./registry.server";
import type { StorageProviderId } from "./storage-provider";
import { importExternalFile } from "./import.server";

export async function browse(data: {
  userId: string;
  targetId?: string;
  provider: StorageProviderId;
  scope: "center" | "organization" | "member";
  folderId?: string | undefined;
  search?: string | undefined;
}) {
  const provider = getStorageProvider(data.provider);
  const target = data.targetId || data.userId;
  const ref = await resolveRef(data.scope, data.provider, target);

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
  targetId?: string;
  yearbookId: string;
  provider: StorageProviderId;
  scope: "center" | "organization" | "member";
  fileIds: string[];
  folderId?: string | undefined;
  studentId?: string | undefined;
  sectionId?: string | undefined;
  category?: string | undefined;
  replacesAssetId?: string | undefined;
}) {
  const target = data.targetId || data.userId;
  const ref = await resolveRef(data.scope, data.provider, target);

  // For multi-file import, we iterate.
  const results = await Promise.all(
    data.fileIds.map((fileId) =>
      importExternalFile({
        yearbookId: data.yearbookId,
        provider: data.provider,
        ref,
        fileId,
        userId: data.userId,
        folderId: data.folderId,
        studentId: data.studentId,
        sectionId: data.sectionId,
        category: data.category,
        replacesAssetId: data.replacesAssetId,
      }),
    ),
  );
  return results[0];
}
