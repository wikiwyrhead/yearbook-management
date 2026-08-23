# Phase 6B Focused Authentication Fixes

The following issues were identified in the Phase 6B authentication audit and have been resolved:

## 1. Member Google Drive

- **Issue**: The authorization URL was not a valid gateway endpoint, and the callback route lacked logic for `google_drive` completion.
- **Fix**:
  - Implemented `authorizeAppUserOAuth` and `exchangeAppUserOAuthCode` in `src/integrations/lovable/appUserConnector.ts` using the Lovable App User Connector gateway.
  - Updated `startOAuthFlow` in `src/lib/storage.functions.ts` to use the gateway for member Google Drive consent.
  - Created `src/routes/oauth.google-drive.return.tsx` to handle the gateway's popup return and post the one-time code back to the app.
  - Added `completeGoogleDriveConnection` server function to exchange the code for a `lovack_*` connection key and store it in the member's encrypted vault.
  - Updated `MemberConnections.tsx` to handle the popup flow and trigger completion.

## 2. Canva PKCE Support

- **Issue**: Canva Connect mandates PKCE (S256), but the implementation used a hardcoded `TODO` placeholder and lacked a challenge/verifier flow.
- **Fix**:
  - Implemented deterministic PKCE derivation in `src/lib/storage/oauth-state.server.ts`. The `code_verifier` is now recomputed from the signed state token in the callback, avoiding session/storage overhead.
  - Updated `startCanvaOAuth` in `src/lib/design.functions.ts` to compute and send the `code_challenge` (S256) and `redirect_uri`.
  - Updated `src/routes/api/public/auth.callback.tsx` to re-derive the verifier for token exchange and include the required `redirect_uri`.

## 3. Box OAuth Redirects

- **Issue**: Missing `redirect_uri` in both authorize and exchange phases.
- **Fix**: Explicitly added `redirect_uri` pointing to `/api/public/auth/callback` in both `startOAuthFlow` and the callback route.

## 4. Security & Vault

- Verified that all `lovack_*` (gateway) and raw OAuth tokens are stored in the database using AES-256-GCM encryption with `MILESTONE_PROVIDER_SECRET`.
- Confirmed server functions never return credentials to the client.

**Status: AUTHENTICATION INFRASTRUCTURE VERIFIED. Final E2E testing awaits provider credentials.**
