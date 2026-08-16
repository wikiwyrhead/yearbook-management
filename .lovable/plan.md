# Phase 4 — Proofreading, Corrections, Verification & Approval

This phase implements a production-grade proofreading workflow, focusing on visual annotations on PDF proofs, structured correction lifecycles, and a rigorous multi-level approval process.

## User Experience

### 1. Proofreading Center
- A new top-level tab in the Yearbook Workspace.
- Dashboard showing proof versions and page-by-page progress.
- Status breakdown: Open corrections, Resolved, Awaiting Verification, Verified, and Approved.
- Activity feed for the current proof version.

### 2. PDF Proof Viewer & Annotator
- Full-screen or high-fidelity viewer for uploaded PDF proofs.
- **Visual Annotations**: Proofreaders can draw rectangles or drop pins directly on the PDF to highlight issues.
- Coordinate-based storage: Annotations remain accurate regardless of zoom or screen size.
- Page navigation: Thumbnails, page jumping, and zoom controls.

### 3. Correction Lifecycle
- Corrections are bound to a specific **Proof Version** and **Page**.
- Statuses: `OPEN`, `ACKNOWLEDGED`, `IN PROGRESS`, `RESOLVED`, `AWAITING VERIFICATION`, `VERIFIED`, `CLOSED`.
- Role enforcement (Database level): The person who resolves a correction CANNOT verify their own resolution. If the reporter and resolver are the same person, another authorized proofreader must verify.
- Reopening a correction after verification automatically invalidates relevant page/section approvals.

### 4. Approval & Production Lock
- Multi-level approval: Page -> Section -> Yearbook.
- Approval is **version-locked**: Approving v5 doesn't automatically approve v6.
- Invalidation triggers: Changing source assets or reopening a correction revokes approval.
- **Production Lock**: Final coordinator action to freeze the yearbook for manufacture.
- **Unlock for Revision**: Reversible only by a Coordinator or Super Admin. Requires a recorded reason, creates an immutable audit record, and flags the yearbook for re-review without deleting historical data.

---

## Technical Details

### 1. Database Schema (`public` schema)
- **`correction_status` (Enum)**: `open`, `acknowledged`, `in_progress`, `resolved`, `awaiting_verification`, `verified`, `closed`, `rejected`, `cancelled`.
- **`annotation_type` (Enum)**: `point`, `rectangle`, `highlight`, `comment`.
- **`correction_category` (Enum)**: `typographical`, `name`, `date`, `caption`, `image`, `missing_asset`, `wrong_asset`, `layout`, `alignment`, `content`, `requirement`, `other`.
- **`corrections` table**:
  - `id`, `yearbook_id`, `proof_id`, `page_id`
  - `annotation_type`, `coordinates` (JSON: x, y, width, height relative to page %)
  - `title`, `description`, `category`, `priority`
  - `status`, `assigned_to` (User ID)
  - `created_by`, `resolved_by`, `verified_by` (and timestamps)
- **`correction_comments` table**: Threaded activity log for corrections.
- **`page_approvals` table**: Records who approved which version of which page.
- **`yearbook_approvals` table**: Final production sign-off and lock state.
- **`proofreader_checklists` table**: Definition of required checks per page type.
- **`page_checklist_responses` table**: User-completed checklist items.

### 2. RLS & Permissions
- Proofreaders: Can view assigned pages/proofs, create corrections, and verify reported issues (enforcing the non-self-verification rule).
- Designers (Staff/Corrector): Can view assigned corrections, mark as resolved, but **not** verified.
- Coordinators: Can assign proofreaders, manage all corrections, and perform final approvals/locking. Admin override for verification.
- Multi-tenant isolation enforced via `yearbook_id` in all policies.

### 3. PDF Rendering
- Integration of a library like `react-pdf` or a canvas-based viewer for performant rendering.
- Layering an SVG or Canvas annotation layer over the PDF page.
- Coordinates stored as percentages (0-100) of the page width/height to ensure responsiveness.

---

## Implementation Sequence

### Step 1: Migration
Create the `corrections`, `page_approvals`, and checklist tables with RLS and Audit triggers.

### Step 2: Server Functions
Implement `getCorrections`, `createCorrection`, `updateCorrectionStatus`, `addCorrectionComment`, `approvePage`, and `getReadinessReport`.

### Step 3: PDF Viewer Component
Build the interactive PDF viewer with annotation capabilities.

### Step 4: Proofreading Center UI
Create the dashboard, correction lists, and approval interfaces.

### Step 5: Production Readiness & Locking
Implement the final checks, the yearbook lock mechanism, and the "Unlock for Revision" workflow with audit logging.
