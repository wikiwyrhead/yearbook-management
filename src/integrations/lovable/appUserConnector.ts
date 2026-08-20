/**
 * App User Connector helpers (Lovable connector gateway).
 *
 * SERVER-ONLY. Reads LOVABLE_API_KEY from process.env. Never import this from
 * a route component, loader, or any client-bundled module.
 *
 * Used by Milestone for MEMBER-scope Google Drive: each member authorizes
 * their own Google account and the gateway issues an opaque per-user
 * connection key (`lovack_*`) that Milestone stores encrypted.
 */

function requireApiKey(): string {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) {
    throw new Error(
      "LOVABLE_API_KEY is not set. App User Connector calls require a server-side workspace token.",
    );
  }
  return key;
}

export interface AppUserOAuthAuthorizeParams {
  gatewayBaseUrl: string;
  connectorId: string;
  appUserId: string;
  clientAPIKey: string;
  returnUrl: string;
  /** Existing lovack_* key — pass on reconnect only. */
  connectionAPIKey?: string | undefined;
  credentialsConfiguration?: Record<string, unknown>;
}

export interface AppUserOAuthAuthorizeResponse {
  authorizationUrl: string;
  sessionId: string;
}

export async function authorizeAppUserOAuth(
  params: AppUserOAuthAuthorizeParams,
): Promise<AppUserOAuthAuthorizeResponse> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${requireApiKey()}`,
    "Content-Type": "application/json",
    "X-Client-Api-Key": params.clientAPIKey,
  };
  if (params.connectionAPIKey) headers["X-Connection-Api-Key"] = params.connectionAPIKey;

  const res = await fetch(`${params.gatewayBaseUrl}/api/v1/app-users/oauth2/authorize`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      connector_id: params.connectorId,
      app_user_id: params.appUserId,
      return_url: params.returnUrl,
      credentials_configuration: params.credentialsConfiguration,
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`App User OAuth start failed (${res.status}): ${text || res.statusText}`);
  }

  let body: { authorization_url?: string; session_id?: string };
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`App User OAuth start returned invalid JSON: ${text.slice(0, 200)}`);
  }
  if (!body.authorization_url) {
    throw new Error("App User OAuth start response missing authorization_url");
  }
  return { authorizationUrl: body.authorization_url, sessionId: body.session_id ?? "" };
}

export interface ExchangeAppUserOAuthCodeResult {
  connectionAPIKey: string;
  connectorId: string;
}

/** Swap the one-time redirect `code` for the per-user connection key. */
export async function exchangeAppUserOAuthCode(
  gatewayBaseUrl: string,
  code: string,
): Promise<ExchangeAppUserOAuthCodeResult> {
  const res = await fetch(`${gatewayBaseUrl}/api/v1/app-users/oauth2/exchange`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ code }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`App User OAuth exchange failed (${res.status}): ${text || res.statusText}`);
  }

  let body: { api_key?: string; connector_id?: string };
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`App User OAuth exchange returned invalid JSON: ${text.slice(0, 200)}`);
  }
  if (!body.api_key) throw new Error("App User OAuth exchange response missing api_key");
  if (!body.connector_id) throw new Error("App User OAuth exchange response missing connector_id");
  return { connectionAPIKey: body.api_key, connectorId: body.connector_id };
}

export interface DisconnectAppUserParams {
  gatewayBaseUrl: string;
  connectionAPIKey: string;
  connectorId: string;
}

export async function disconnectAppUser({
  gatewayBaseUrl,
  connectionAPIKey,
  connectorId,
}: DisconnectAppUserParams): Promise<void> {
  const res = await fetch(`${gatewayBaseUrl}/api/v1/app-users/connection`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${requireApiKey()}`,
      "X-Connection-Api-Key": connectionAPIKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ connector_id: connectorId }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`App User disconnect failed (${res.status}): ${text || res.statusText}`);
  }
}
