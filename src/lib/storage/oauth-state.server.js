/**
 * Phase 6 — Internal OAuth state management.
 *
 * This module handles generation and validation of OAuth 'state' parameters,
 * ensuring that callbacks are correctly routed and authorized.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
function secret() {
    const s = process.env["MILESTONE_PROVIDER_SECRET"];
    if (!s)
        throw new Error("MILESTONE_PROVIDER_SECRET is not set. Provider connection unavailable.");
    return s;
}
/**
 * Generate a signed OAuth state token.
 */
export function generateOAuthState(data) {
    const state = { ...data, timestamp: Date.now() };
    const payload = Buffer.from(JSON.stringify(state)).toString("base64url");
    const signature = createHmac("sha256", secret()).update(payload).digest("base64url");
    return `${payload}.${signature}`;
}
/**
 * Validate and parse a signed OAuth state token.
 */
export function validateOAuthState(token) {
    const [payload, signature] = token.split(".");
    if (!payload || !signature)
        throw new Error("Invalid state format");
    const expectedSignature = createHmac("sha256", secret()).update(payload).digest("base64url");
    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
        throw new Error("State signature mismatch (CSRF detected)");
    }
    const state = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    // 15-minute expiration
    if (Date.now() - state.timestamp > 15 * 60 * 1000) {
        throw new Error("OAuth state expired. Please try again.");
    }
    return state;
}
