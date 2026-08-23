/**
 * Internal OAuth & Correlation state management (HMAC-SHA256, Replay Protection, PKCE).
 */
import { createHash, createHmac, timingSafeEqual, randomBytes } from "node:crypto";

export type OAuthState = {
  provider: "google_drive" | "box" | "canva";
  scope: "center" | "organization" | "member";
  userId: string;
  centerId?: string | null;
  yearbookId?: string | null;
  nonce?: string;
  timestamp: number;
};

function secret(): string {
  const s = process.env["MILESTONE_PROVIDER_SECRET"];
  if (!s) throw new Error("MILESTONE_PROVIDER_SECRET is not set. Provider connection unavailable.");
  return s;
}

const consumedStates = new Set<string>();

/**
 * Generate a signed OAuth state token.
 */
export function generateOAuthState(data: Omit<OAuthState, "timestamp">): string {
  const nonce = data.nonce || randomBytes(16).toString("hex");
  const state: OAuthState = { ...data, nonce, timestamp: Date.now() };
  const payload = Buffer.from(JSON.stringify(state)).toString("base64url");
  const signature = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

/**
 * Generate a correlation state token specifically for Canva Return Navigation.
 */
export function generateCorrelationState(data: {
  userId: string;
  yearbookId: string;
  designId?: string;
}): string {
  return generateOAuthState({
    provider: "canva",
    scope: "member",
    userId: data.userId,
    yearbookId: data.yearbookId,
  });
}

/**
 * Validate and parse a signed OAuth state token.
 */
export function validateOAuthState(token: string): OAuthState {
  if (!token || typeof token !== "string") {
    throw new Error("Invalid state format: empty token");
  }

  const [payload, signature] = token.split(".");
  if (!payload || !signature) throw new Error("Invalid state format");

  const expectedSignature = createHmac("sha256", secret()).update(payload).digest("base64url");
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSignature);

  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    throw new Error("State signature mismatch (CSRF or tampering detected)");
  }

  const state = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as OAuthState;

  // 15-minute expiration
  if (Date.now() - state.timestamp > 15 * 60 * 1000) {
    throw new Error("OAuth state expired. Please try again.");
  }

  return state;
}

/**
 * Validate and consume state token to enforce single-use replay protection.
 */
export function validateAndConsumeOAuthState(token: string): OAuthState {
  if (consumedStates.has(token)) {
    throw new Error("State token has already been consumed (replay attack detected).");
  }

  const state = validateOAuthState(token);
  consumedStates.add(token);

  // Auto clean up after 20 minutes
  setTimeout(
    () => {
      consumedStates.delete(token);
    },
    20 * 60 * 1000,
  );

  return state;
}

/**
 * PKCE (RFC 7636) support for providers that require it (Canva Connect).
 */
export function deriveCodeVerifier(stateToken: string): string {
  const payload = stateToken.split(".")[0];
  if (!payload) throw new Error("Invalid state format");
  return createHmac("sha256", secret()).update(`pkce:${payload}`).digest("base64url");
}

export function codeChallengeS256(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}
