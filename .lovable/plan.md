# Phase 3: Canva Integration & Production Design Workflow

Connecting the yearbook content lifecycle to Canva and establishing a versioned proofing system.

## Schema Changes
- **New Table: `proofs`**
  - Columns: `id`, `yearbook_id`, `version`, `storage_path`, `canva_export_id`, `created_by`, `status` (processing, ready, failed), `notes`, `created_at`.
- **New Table: `proof_pages`**
  - Links proofs to specific pages included in that version.
- **Update Table: `pages`**
  - Add `design_status` (waiting_for_assets, ready_for_design, designing, complete, needs_review).
  - Add `design_readiness_override` (boolean).
- **New Table: `canva_integrations`**
  - Stores yearbook-level Canva connection metadata (team_id, folder_id).

## Database Logic
- **RLS Policies**: Standard yearbook-scoped access for new tables.
- **Trigger**: Asset Change Awareness. If an approved asset linked to a page is updated/replaced, flag the page design status as `needs_review`.

## Server Functions (`src/lib/yearbook.functions.ts`)
- `getCanvaConfig`: Retrieve yearbook integration details.
- `updateDesignStatus`: Manual or automatic state transitions.
- `createProof`: Handles manual PDF upload or triggers Canva export.
- `getProofs`: Fetch version history for a yearbook/page.
- `checkAssetChanges`: Backend check to identify pages with modified source assets.

## UI Enhancements
- **Design Workspace (`src/components/yearbook/DesignWorkspace.tsx`)**:
  - A production-focused view showing page readiness based on requirement fulfillment.
  - Visual indicators for "Ready for Design" (all requirements met).
- **Canva Integration Component**:
  - Modal to link Canva designs to pages using existing `canva_design_id` fields.
  - Asynchronous export status polling for Canva PDFs.
- **Proof Gallery**:
  - Lightweight version history list.
  - PDF viewer/link for exported or uploaded proofs.
- **Page Asset Panel**:
  - Sidebar in the design view showing thumbnails of all approved assets for the current page.

## Technical Strategy
- **Modular Service**: Create `src/lib/canva.server.ts` to encapsulate API interactions.
- **Fail-safe**: "Upload PDF Proof" fallback is always visible if automatic export fails or isn't configured.
- **Readiness Logic**: Computed client-side for immediate feedback, but mirrored in `design_status` for dashboard reporting.
