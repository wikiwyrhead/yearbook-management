# Phase 2: Asset Management System

Establish a robust, secure, and production-ready asset management system for school yearbooks. This phase transitions the project from a structural layout (Build 1) to a functional content collection engine.

## 1. Foundation & Security
- **RLS Enforcement**: Extend database policies to ensure students can only upload to their own requirements while coordinators maintain full visibility.
- **Modular Storage**: Implement a storage abstraction that defaults to Lovable Cloud but is ready for external providers (Google Drive, etc.).
- **Audit Trails**: Record every asset action (upload, approval, rejection, replacement) for accountability.

## 2. Asset Library & Workflow
- **Centralized Management**: A searchable, filterable library for photos, PDFs, and documents per yearbook.
- **Status Lifecycle**: Track assets from `missing` and `requested` to `under_review`, `approved`, or `archived`.
- **Versioning**: Retain all previous versions of an asset (e.g., student portraits) to prevent data loss.
- **Validation**: Basic image checks (resolution, orientation, file size) with clear UI warnings.

## 3. Production Features
- **Page-Requirement Mapping**: Link assets to Phase 1 Page Ladder requirements with automatic completion counters.
- **Bulk Upload**: Handle large batches of photos using chunked processing to avoid server timeouts.
- **Duplicate Detection**: Smart detection to identify and handle potential duplicate files during upload.
- **Invitation System**: Lay the groundwork for inviting members via email to join the production team.

## Technical Tasks
- **Database**: Add `assets`, `page_assets`, `asset_audit_log`, and `yearbook_invitations` tables.
- **Server Functions**: Implement library fetching, bulk processing logic, and requirement counting.
- **UI Components**:
    - `AssetLibrary`: Main grid/list view with filters.
    - `AssetDetail`: Version history and metadata management.
    - `BulkUpload`: Batch processing UI with record mapping.
    - `StudentSubmission`: Personalized view for student contributions.
- **Dashboard**: Add asset completion metrics (e.g., "91% portraits collected").
