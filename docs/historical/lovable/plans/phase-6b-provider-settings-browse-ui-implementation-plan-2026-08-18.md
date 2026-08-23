# Phase 6B: Provider Settings & Browse UI Implementation Plan

Build the UI for managing external storage (Google Drive, Box) and Canva design integration, leveraging the existing Phase 6A server-side architecture.

## 1. Organization Storage Management

- **Component**: `StorageSettings.tsx`
- **Scope**: Super Admin only.
- **Providers**: Google Drive, Box.
- **Functionality**:
  - Connect/Disconnect/Reconnect.
  - Designate "Active/Authoritative" storage provider.
  - Display connection status, account info, and authoritative status.
  - Clearly distinguish between "ACTIVE" and "CONNECTED BUT NOT ACTIVE".

## 2. Member Storage (Import-Only)

- **Component**: `MemberConnections.tsx`
- **Scope**: Authenticated member.
- **Providers**: Google Drive (initial implementation).
- **Functionality**:
  - Strictly IMPORT-ONLY.
  - Linked to personal account.
  - No sharing or authoritative role.

## 3. Unified Provider Browser

- **Component**: `ProviderBrowser.tsx`
- **Functionality**:
  - Folder navigation and file listing.
  - Search/filter (where supported).
  - Multi-file selection and import progress.
  - Success/failure reporting with retry.
  - Integrated with existing `importExternalFile` workflow to preserve RLS and metadata.

## 4. Canva Integration in Design Workspace

- **Component**: `CanvaDesignPicker.tsx`
- **Functionality**:
  - List real Canva designs via API.
  - Link design to Milestone page (replacing manual ID entry).
  - Handle connection lifecycle (Connect/Disconnect).
  - Display "AWAITING CREDENTIALS" if API keys are missing.

## 5. UI/UX Consistency

- **Connection States**: `CONNECTED`, `DISCONNECTED`, `AWAITING CREDENTIALS`, `REAUTHORIZATION REQUIRED`, `ERROR`.
- **States**: Only show `CONNECTED` after successful API verification.
- **Preservation**: Do not modify Phase 1-5 production workflows or database schema.

## 6. Security & RLS

- Enforce organization vs member ownership.
- Credentials remain server-side and encrypted.
- OAuth callbacks and state protection remain unchanged.
