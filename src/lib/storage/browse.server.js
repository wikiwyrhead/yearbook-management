/**
 * Server-only browsing and import execution for storage providers.
 */
import { getStorageProvider, resolveRef } from "./registry.server";
import { importExternalFile } from "./import.server";
export async function browse(data) {
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
export async function runImport(data) {
    const ref = await resolveRef(data.scope, data.provider, data.userId);
    // For multi-file import, we iterate.
    const results = await Promise.all(data.fileIds.map((fileId) => importExternalFile({
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
    })));
    return results[0];
}
