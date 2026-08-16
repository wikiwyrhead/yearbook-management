# Phase 5: Final Production & Service Bureau Workflow

This phase establishes the final lifecycle of a yearbook, transforming approved content into an immutable production record for Service Bureau submission.

## User-Facing Changes

### Production Dashboard
- A new **Production** section in the Yearbook Control Center.
- Real-time status tracker: `Production Status`, `Latest Snapshot`, `Preflight Result`, `Submission Status`.
- Clear "Ready for Service Bureau" vs. "Not Ready" indicator with a list of blockers.

### Production Snapshots & Preflight
- **Create Snapshot**: A "Generate Production Snapshot" action for Coordinators.
- **Preflight Report**: A detailed list of PASS/FAIL checks (page count, approvals, open corrections, asset versions).
- **Warning Acknowledgment**: UI to review and acknowledge non-blocking warnings.

### Service Bureau Management
- **Service Bureau Directory**: Admin UI to manage providers (contact info, submission methods).
- **Package Generation**: Tool to bundle the final PDF, manifest, and preflight report.
- **Submission Tracking**: A workflow to record when a package was sent, external reference numbers, and status updates (Ready, Submitted, In Review, etc.).

### Revision & History
- **Unlock for Revision**: Explicit action requiring a reason, triggering a new audit entry and allowing a new snapshot to be created.
- **Production Timeline**: A visual history of snapshots, packages, and submissions.

## Technical Details

### Schema Updates
- `service_bureaus`: Registry of external providers.
- `production_snapshots`: Immutable capture of yearbook state (version, page count, proof IDs).
- `preflight_reports`: Persistent results of production checks.
- `production_packages`: Record of generated files with SHA-256 checksums.
- `service_bureau_submissions`: Lifecycle tracking for external submission.

### Server Functions
- `createProductionSnapshot`: Deep-copies current yearbook state (page order, numbers, exact proof versions, asset versions, approvals, and checklist results) into an immutable record.
- `runPreflight`: Validates business rules (no open corrections, all pages approved, assets linked) and generates a persistent report.
- `generateProductionPackage`: Generates actual production package manifest, computes SHA-256 checksums for files, and bundles them in storage.
- `updateSubmissionStatus`: Manages the state machine for Service Bureau progress.

### Security & RLS
- Enforced immutability: Production snapshots, packages, and reports are read-only once created (except for submission status updates by authorized roles).
- All new tables scoped by `yearbook_id`.
- Storage paths for snapshots/packages isolated under `yearbooks/{yearbook_id}/production/`.
- Strict RLS ensuring only Coordinators/Super Admins can trigger snapshots or submissions.
- Immutable audit logs for every production event.

## Constraints & Assumptions
- **Manual Submission**: The initial implementation supports manual tracking (user downloads package, uploads to printer, records ID). No direct printer API integrations.
- **Real Package Generation**: Generates actual manifests and checksums for the production record.
- **Application Validation**: Checks are focused on business logic and presence; professional prepress (CMYK, font embedding) is not included.
- **Immutability**: Once a snapshot or package is created, it cannot be edited or deleted by normal users. Revisions require a new snapshot.
