/**
 * Server-only credential vault for external providers.
 *
 * OAuth tokens are stored encrypted (AES-256-GCM) in the `credentials` JSONB
 * column and are NEVER returned to the browser. Only this module decrypts them,
 * and only inside server function handlers.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function key(): Buffer {
  const raw = process.env["MILESTONE_PROVIDER_SECRET"];
  if (!raw) throw new Error("MILESTONE_PROVIDER_SECRET is not set");
  const buf = Buffer.from(raw, "base64");
  return buf.length === 32 ? buf : Buffer.from(raw.padEnd(32, "0").slice(0, 32), "utf8");
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

export function decryptSecret(stored: string): string {
  const buf = Buffer.from(stored, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key(), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
}

export type StoredCredentials = {
  /** Lovable connector-gateway connection key (Google Drive app-user flow). */
  connectionKey?: string;
  /** Raw OAuth access token (Box / Canva direct API). */
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
};

export function sealCredentials(creds: StoredCredentials): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(creds)) {
    if (typeof v === "string" && v.length > 0) out[k] = encryptSecret(v);
  }
  return out;
}

export function openCredentials(sealed: unknown): StoredCredentials {
  if (!sealed || typeof sealed !== "object") return {};
  const out: StoredCredentials = {};
  for (const [k, v] of Object.entries(sealed as Record<string, unknown>)) {
    if (typeof v !== "string") continue;
    try {
      (out as Record<string, string>)[k] = decryptSecret(v);
    } catch {
      // A credential that cannot be decrypted is treated as absent, which
      // surfaces as "needs reauthorization" instead of a hard crash.
    }
  }
  return out;
}
