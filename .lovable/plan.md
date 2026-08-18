# Phase 6B: Provider Settings & Browse UI Implementation Plan

Build the UI for managing external storage (Google Drive, Box) and Canva design integration, leveraging the existing Phase 6A server-side architecture.

## 1. Provider Settings & Management
- **Organization Settings**: Create `StorageSettings` component for Super Admins to manage authoritative yearbook storage.
- **Member Settings**: Add "My Connections" section in the Team/Profile tab for personal import-only Drive/Box connections.
- **Connection Logic**: Wire up `startOAuthFlow`, `disconnectOrganizationProvider`, and `disconnectMyStorage` server functions.
- **Canva Integration**: Add Canva connection management to the Design Workspace.

## 2. Browse & Import UI
- **Unified Browser**: Create `ProviderBrowser` component that supports both Org and Member scopes.
- **Import Flow**: Integrate with `browseProvider` and `importProviderFiles` server functions.
- **Progress Tracking**: Show visual feedback during multi-file imports.

## 3. Canva Design Integration
- **Design Selection**: Implement `CanvaDesignPicker` to list designs via `listCanvaDesigns`.
- **Linking**: Replace manual ID input with a visual picker in the Design Workspace.

## Technical Details

### Components to Create/Update
- `src/components/yearbook/storage/StorageSettings.tsx`: Org-level storage config.
- `src/components/yearbook/storage/MemberConnections.tsx`: User-level import sources.
- `src/components/yearbook/storage/ProviderBrowser.tsx`: Folder/file navigation and selection.
- `src/components/yearbook/design/CanvaDesignPicker.tsx`: Visual selection of Canva designs.
- Update `src/components/yearbook/DesignWorkspace.tsx`: Integrate Canva picker and connection status.
- Update `src/routes/_authenticated/yearbooks.$yearbookId.tsx`: Add "Storage" tab (or integrate into Team/Settings).

### UX States
- `CONNECTED`: Active session, show account email.
- `DISCONNECTED`: Not linked, show "Connect" button.
- `AWAITING CREDENTIALS`: Provider implementation present but missing API keys in environment.
- `REAUTHORIZATION REQUIRED`: 401/Expired token state.
- `ERROR`: General API failure.

### Security
- RLS enforced via existing server functions.
- Organization storage (Google Drive/Box) only manageable by Super Admins.
- Member storage is strictly IMPORT-ONLY.
