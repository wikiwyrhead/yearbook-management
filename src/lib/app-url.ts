/**
 * Canonical Application & OAuth URL Resolver
 *
 * Ensures all OAuth flows (Google Drive, Box, Canva) and authentication redirects
 * derive from the configured canonical development/production hostname
 * (e.g. http://yearbook-manager.test) without hardcoding localhost or IP addresses.
 */

export function getAppBaseUrl(request?: Request): string {
  // 1. Check environment variable (configured VITE_APP_URL or APP_URL)
  const envUrl =
    (typeof process !== "undefined" && (process.env["VITE_APP_URL"] || process.env["APP_URL"])) ||
    (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_APP_URL);

  // 2. Derive from active request headers if available (SSR)
  if (request) {
    const rawHost = request.headers.get("x-forwarded-host") || request.headers.get("host");
    const rawProto =
      request.headers.get("x-forwarded-proto") ||
      (request.url.startsWith("https") ? "https" : "http");
    if (rawHost) {
      const host = rawHost.split(",")[0]!.trim();
      const proto = rawProto.split(",")[0]!.trim();
      return `${proto}://${host}`.replace(/\/+$/, "");
    }
    if (request.url && !request.url.startsWith("/")) {
      return new URL(request.url).origin.replace(/\/+$/, "");
    }
  }

  // 3. Derive from browser window if running on client
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin.replace(/\/+$/, "");
  }

  if (
    envUrl &&
    typeof envUrl === "string" &&
    envUrl.trim().length > 0 &&
    envUrl !== "http://yearbook-manager.test"
  ) {
    return envUrl.trim().replace(/\/+$/, "");
  }

  // 4. Default fallback
  return "https://milestone-portal.arnelbg.com";
}

export function getOAuthCallbackUrl(request?: Request): string {
  return `${getAppBaseUrl(request)}/api/public/auth/callback`;
}
