# Google Drive / Box / Canva Authentication Audit (pre-credentials)

Audit only. No implementation was modified. Nothing below is marked PASS on the basis of code inspection alone.

## 1. Organization Google Drive

**Implemented model: F — Other (Lovable connector-gateway call with a raw env value used as a gateway connection key).**

Actual code path (`src/lib/storage/google-drive.provider.ts`):

- All calls go to `https://connector-gateway.lovable.dev/google_drive/drive/v3/...`
- Headers: `Authorization: Bearer ${LOVABLE_API_KEY}` and `X-Connection-Api-Key: <connection key>`
- For `scope: "organization"` with no stored connection key, it falls back to `process.env.GOOGLE_DRIVE_API_KEY`.

Verification of the assumption:

- `GOOGLE_DRIVE_API_KEY` is **not** a Google API key in this architecture. It is only meaningful if it is the connection key minted by linking a workspace **App connector** for Google Drive (`standard_connectors--connect`), which writes exactly that env var name.
- A genuine Google _API key_ cannot list, browse, download, or import private Drive files. It only works for public/unrestricted resources. So the QA report wording ("Organization Google Drive requires GOOGLE_DRIVE_API_KEY", implying an API key) is **incorrect**.
- `GOOGLE_DRIVE_API_KEY` is currently **not set** in the environment; no Google Drive App connector is linked to this project. Organization Google Drive is therefore **AWAITING CREDENTIALS** and untested.

Minimal architectural correction: none in code, only in configuration + documentation. Link a workspace **Google Drive App connector** (OAuth on the org's Google account) to the project; the gateway then injects `GOOGLE_DRIVE_API_KEY` as the gateway connection key, and the existing provider works unchanged. The docs/QA report must stop describing this as a "Google API key".

## 2. Member Google Drive

Implemented flow today (`startOAuthFlow` in `src/lib/storage.functions.ts`):

- Builds `https://connector-gateway.lovable.dev/google_drive/oauth/authorize?project_id=...&state=...`

Findings:

- That URL is **not a real gateway endpoint**. The per-user (App User Connector) authorize endpoint is `https://connector-gateway.lovable.dev/api/v1/app-users/oauth2/authorize`, requires a client API key (`GOOGLE_DRIVE_APP_USER_CONNECTOR_CLIENT_API_KEY`), an `app_user_id`, and `credentials_configuration.scopes` with full Google scope URLs.
- The unified callback `src/routes/api/public/auth.callback.tsx` explicitly throws for any provider other than `box`/`canva`, so even a returning Google redirect would fail. No `lovack_*` connection key is ever exchanged or stored for a member.
- Therefore: **member Google Drive is NOT functional.** It must not be claimed as working. Browse/import for members will fail with "member has not connected their Google Drive".

Does the managed connector support per-user Google Drive? **Yes.** The `google_drive` App User Connector is available and enabled in this workspace, so a **custom Google OAuth provider is not required**. The correct fix (out of scope for this audit) is to wire the App User Connector flow: `connector_app_user--connect_client` for `google_drive`, start consent via the app-user authorize endpoint, exchange the one-time code server-side, and store the encrypted `lovack_*` key per authenticated user (the existing AES-256-GCM vault already fits).

## 3. Required configuration (only values the code actually reads)

| Env var                     | Read at                                                         | Purpose                                                                                    | Present |
| --------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------- |
| `LOVABLE_API_KEY`           | `google-drive.provider.ts`                                      | Gateway bearer auth                                                                        | Yes     |
| `GOOGLE_DRIVE_API_KEY`      | `google-drive.provider.ts` (org fallback)                       | Gateway **connection key** from a linked Google Drive App connector — not a Google API key | No      |
| `MILESTONE_PROVIDER_SECRET` | `oauth-state.server.ts`, `credentials.server.ts`                | HMAC state signing + AES-256-GCM token vault                                               | Yes     |
| `BOX_CLIENT_ID`             | `storage.functions.ts`, `auth.callback.tsx`, `box.provider.ts`  | Box OAuth client id                                                                        | No      |
| `BOX_CLIENT_SECRET`         | `auth.callback.tsx`, `box.provider.ts`                          | Box OAuth client secret                                                                    | No      |
| `CANVA_CLIENT_ID`           | `design.functions.ts`, `auth.callback.tsx`, `canva.provider.ts` | Canva Connect client id                                                                    | No      |
| `CANVA_CLIENT_SECRET`       | `auth.callback.tsx`, `canva.provider.ts`                        | Canva Connect client secret                                                                | No      |
| `LOVABLE_PROJECT_ID`        | `storage.functions.ts` (Google authorize URL)                   | Used only by the non-functional Google authorize URL                                       | Yes     |

No service-account credentials, domain-wide delegation, or Workspace/domain configuration are read anywhere in the code. Do not provision them.

## 4. Box and Canva

Box:

- Authorize URL built in `startOAuthFlow` omits `redirect_uri`; Box will use the app's configured redirect URI, so the Box developer app must register `https://<public-app-url>/api/public/auth/callback` exactly.
- Token exchange in the callback also omits `redirect_uri`. Box accepts this when the app has a single registered URI; with multiple URIs it will fail. Untested.
- Required: `BOX_CLIENT_ID`, `BOX_CLIENT_SECRET`, registered redirect URI. No PKCE.

Canva:

- **Blocking defect:** the callback sends `code_verifier: "TODO_PKCE_VERIFIER"`. Canva Connect mandates PKCE (S256), and `startCanvaOAuth` never generates or sends a `code_challenge`. The exchange will always fail with an invalid-grant/PKCE error. Canva OAuth cannot work until a real PKCE verifier is generated at start, carried through state/session, and sent at exchange.
- The authorize URL also omits `redirect_uri` and `code_challenge`.
- Required: `CANVA_CLIENT_ID`, `CANVA_CLIENT_SECRET`, registered redirect URI `https://<public-app-url>/api/public/auth/callback`, plus PKCE implementation.

Callback route: `src/routes/api/public/auth.callback.tsx` is registered under the public prefix, so the real path is `/api/public/auth/callback` on both
`https://yearbook-ladder-dreams.lovable.app` (published) and the stable `project--6b5a8e58-8623-4724-8209-d01a0597fde5.lovable.app` host. Providers must register the **published/stable** host, not the `id-preview--` URL.

## 5. Provider Credential & Authentication Matrix

| Provider     | Scope                     | Authentication Model                                                                                                              | Required Configuration                                                                                                                                                                                                 | OAuth Required                                                 | Real E2E Status                                                 |
| ------------ | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------- |
| Google Drive | Organization              | Lovable connector gateway using a linked **App connector** (workspace Google OAuth); no API key, no service account               | `LOVABLE_API_KEY` (present) + `GOOGLE_DRIVE_API_KEY` = gateway connection key from linking the Google Drive App connector                                                                                              | Yes (performed once by the org admin during connector linking) | AWAITING CREDENTIALS — untested                                 |
| Google Drive | Member                    | Intended per-user connection; **currently broken** — authorize URL is not a real endpoint and the callback rejects `google_drive` | Requires the `google_drive` **App User Connector** client (`GOOGLE_DRIVE_APP_USER_CONNECTOR_CLIENT_API_KEY`) + code-exchange/storage wiring; `APP_USER_CONNECTION_KEY_SECRET` or existing vault for the `lovack_*` key | Yes, per user                                                  | NOT FUNCTIONAL — not credential-blocked, implementation-blocked |
| Box          | Organization (and member) | Custom OAuth 2.0 authorization code, tokens AES-256-GCM encrypted in DB                                                           | `BOX_CLIENT_ID`, `BOX_CLIENT_SECRET`, redirect URI `https://<public-app-url>/api/public/auth/callback`                                                                                                                 | Yes                                                            | AWAITING CREDENTIALS — untested                                 |
| Canva        | Yearbook (org-equivalent) | Custom OAuth 2.0 + PKCE (PKCE **not implemented**)                                                                                | `CANVA_CLIENT_ID`, `CANVA_CLIENT_SECRET`, redirect URI `https://<public-app-url>/api/public/auth/callback`, real S256 PKCE verifier/challenge                                                                          | Yes                                                            | BLOCKED — will fail even with valid credentials                 |

## Corrections to the Phase 6B QA report

1. "Organization Google Drive requires GOOGLE_DRIVE_API_KEY" — misleading; it requires a linked Google Drive App connector whose gateway connection key lands in that env var. A plain Google API key cannot access private Drive files.
2. "Member Google Drive requires LOVABLE_API_KEY + User Auth" — false. The per-user flow is not implemented; it needs the Google Drive App User Connector client plus code-exchange and per-user key storage.
3. Canva must not be listed as "awaiting credentials only" — the hardcoded `TODO_PKCE_VERIFIER` is a functional defect.
