/**
 * Milestone Yearbook — Storage URL Resolver
 * Resolves storage paths to appropriate streaming endpoints.
 */

export function getStorageUrl(
  path?: string | null,
  bucket: "yearbook_assets" | "yearbook_proofs" | "yearbook_production" = "yearbook_assets",
): string {
  if (!path) return "";
  if (
    path.startsWith("http://") ||
    path.startsWith("https://") ||
    path.startsWith("data:") ||
    path.startsWith("blob:") ||
    path.startsWith("/api/storage/")
  ) {
    return path;
  }
  const cleanPath = path.replace(/^\/+/, "");
  return `/api/storage/${bucket}/${cleanPath}`;
}
