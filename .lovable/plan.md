# Phase 6A: OAuth & Provider Connection Foundation

Implement the secure OAuth lifecycle for external providers (Box, Canva) and clarify the Google Drive managed connection.

## 1. Unified OAuth State Management
- Create `src/lib/storage/oauth-state.server.ts` to manage signed state tokens (HMAC-SHA256).
- Protect against CSRF and ensure correct routing of callbacks back to the initiating user/yearbook.

## 2. Public Auth Callback Route
- Create `src/routes/api/public/auth.callback.ts` as the unified redirect URI.
- Handle code exchange for Box and Canva.
- Securely encrypt and store tokens using the existing AES-256-GCM vault.

## 3. Provider Specific Wiring
- **Google Drive:** Clarify in code that it uses the Lovable Managed Connector (API keys vs User connection keys).
- **Box:** Implement authorization URL generation and token exchange logic.
- **Canva:** Implement authorization URL generation (with PKCE) and token exchange logic.

## 4. Connection Ownership Enforcement
- Verify RLS and application logic distinguish between Org-level storage and Member-level import sources.
- Ensure Super Admin access is explicitly audited and RLS-checked.

## Technical Details
- **Encryption:** Requires `MILESTONE_PROVIDER_SECRET` in the environment.
- **RLS:** Super Admin access is authorized via `is_super_admin` in policies, not by bypassing the DB security layer entirely.
- **Storage:** Milestone remains the source of truth; imports are copies of external bytes.
