/**
 * Phase 6 — Internal OAuth state management.
 *
 * This module handles generation and validation of OAuth 'state' parameters,
 * ensuring that callbacks are correctly routed and authorized.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type OAuthState = {
  provider: "google_drive" | "box" | "canva";
  scope: "organization" | "member";
  userId: string;
  yearbookId?: string | null;
  timestamp: number;
};

function secret(): string {
  const s = process.env["MILESTONE_PROVIDER_SECRET"];
  if (!s) throw new Error("MILESTONE_PROVIDER_SECRET is not set. Provider connection unavailable.");
  return s;
}

/**
 * Generate a signed OAuth state token.
 */
export function generateOAuthState(data: Omit<OAuthState, "timestamp">): string {
  const state: OAuthState = { ...data, timestamp: Date.now() };
  const payload = Buffer.from(JSON.stringify(state)).toString("base64url");
  const signature = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

/**
 * Validate and parse a signed OAuth state token.
 */
export function validateOAuthState(token: string): OAuthState {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) throw new Error("Invalid state format");

  const expectedSignature = createHmac("sha256", secret()).update(payload).digest("base64url");
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    throw new Error("State signature mismatch (CSRF detected)");
  }

  const state = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as OAuthState;
  
  // 15-minute expiration
  if (Date.now() - state.timestamp > 15 * 60 * 1000) {
    throw new Error("OAuth state expired. Please try again.");
  }

  return state;
}

/**
 * PKCE (RFC 7636) support for providers that require it (Canva Connect).
 *
 * The verifier is DERIVED from the signed state token with the server secret,
 * so it never travels in a URL, cookie, or database row: only this server can
 * recompute it in the callback from the state it issued.
 */
export function deriveCodeVerifier(stateToken: string): string {
  const payload = stateToken.split(".")[0];
  if (!payload) throw new Error("Invalid state format");
  return createHmac("sha256", secret()).update(`pkce:${payload}`).digest("base64url");
}

export function codeChallengeS256(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}
