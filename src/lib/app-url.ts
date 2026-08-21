/**
 * Canonical Application & OAuth URL Resolver
 *
 * Ensures all OAuth flows (Google Drive, Box, Canva) and authentication redirects
 * derive from the configured canonical development/production hostname
 * (e.g. http://yearbook-manager.test) without hardcoding localhost or IP addresses.
 */

export function getAppBaseUrl(request?: Request): string {
  // 1. Check window.__ENV__ in browser
  const winEnv = (typeof window !== "undefined" && (window as any).__ENV__) || {};
  if (winEnv.VITE_APP_URL && typeof winEnv.VITE_APP_URL === "string" && winEnv.VITE_APP_URL.trim().length > 0) {
    return winEnv.VITE_APP_URL.trim().replace(/\/+$/, "");
  }

  // 2. Check environment variable (configured VITE_APP_URL or APP_URL)
  const envUrl = (typeof process !== "undefined" && (process.env["VITE_APP_URL"] || process.env["APP_URL"])) ||
    (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_APP_URL);

  if (envUrl && typeof envUrl === "string" && envUrl.trim().length > 0) {
    return envUrl.trim().replace(/\/+$/, "");
  }

  // 2. Derive from active request headers if available (SSR)
  if (request) {
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
    const proto = request.headers.get("x-forwarded-proto") || (request.url.startsWith("https") ? "https" : "http");
    if (host) {
      return `${proto}://${host}`.replace(/\/+$/, "");
    }
    return new URL(request.url).origin.replace(/\/+$/, "");
  }

  // 3. Derive from browser window if running on client
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin.replace(/\/+$/, "");
  }

  // 4. Default canonical local development hostname
  return "http://yearbook-manager.test";
}

export function getOAuthCallbackUrl(request?: Request): string {
  return `${getAppBaseUrl(request)}/api/public/auth/callback`;
}
