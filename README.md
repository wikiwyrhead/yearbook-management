# Yearbook Foundation

Milestone Yearbook — Build 1: Foundation + Page Ladder

Scope for this round: Phase 1 (schools, yearbooks, people, roles, project-level access) plus the Page Ladder with assignments, statuses and requirements. Real backend with logins and a database. Canva is not wired yet — pages store a Canva design link/ID field so the integration can slot in later without a rewrite.

What you'll be able to do after this build

Sign in and land on a Production Control Center listing every yearbook you have access to.

Create a School once, then create yearbook years under it (2026, 2027...). School info, logo, contacts and defaults are reused each year.

Add members to a specific yearbook and give each one a role there: Coordinator, Staff, Proofreader, Corrector, or Student. Membership is per yearbook, so a 2026 member sees nothing of 2025.

Import or add Students, Faculty and Classes with structured, canonical name fields (first, middle, last, preferred, suffix, grade, student ID) so names are never retyped later.

Build the Page Ladder for a yearbook: add, edit, reorder and renumber pages; set section, page type, description, required assets, notes and Canva design reference.

Assign a page or a page range to a designer, and separately to a proofreader — assignment is independent of role.

Move each page through the production status list (Planned → ... → Submitted to Service Bureau) and see the whole book colour-coded at a glance, filterable by section, status and assignee.

Define per-page requirements (e.g. "8 portraits, 8 names, 1 class photo, 1 teacher message") and see the have/need counters and the blocking reason. Counters are manual in this build; they become automatic once assets land in the next phase.

Students sign in and see only their own profile and submission status.

Access model

Nothing is global except the Super Admin. Every read and write is scoped by yearbook membership, enforced in the database itself, not just in the UI:

Super Admin — everything, all schools and years.

Coordinator — full control of their yearbook only.

Staff — their yearbook, limited to what's assigned.

Proofreader — their yearbook's pages and proofs; assigned pages highlighted. No people/asset admin.

Corrector — assigned corrections and the pages they touch.

Student — own record only.

Technical notes

Supabase (PostgreSQL + Auth + Storage) backend.

Roles stored in a dedicated per-yearbook membership table (yearbook_members), never on a profile row. A has_yearbook_role(user, yearbook, role) security-definer function backs every RLS policy, avoiding recursive policy checks and privilege escalation.

Tables: schools, yearbooks, profiles, yearbook_members, students, faculty, classes, sections, page_types, pages, page_requirements, page_assignments, organization_storage_connections, member_storage_connections, canva_integrations. Every public table gets explicit GRANTs plus RLS.

Page ladder ordering uses a sortable position column separate from the printed page number, so reordering does not corrupt numbering; page count and sections are fully data-driven, nothing hard-coded.

Statuses and page types are rows, not enums baked into code, so the template/rollover features in later phases can copy them.

Pages carry canva_design_id, canva_design_url, canva_synced_at from day one; the Canva service connects directly via Canva Connect API.

Data access via TanStack Start server functions with auth middleware; no client-side trust for permissions.

## Development & Deployment

Refer to [`README-LOCAL.md`](file:///home/wiki/projects/yearbook-management/README-LOCAL.md) for full local and Docker setup instructions.

```sh
npm install
npm run dev
```

To build and run via Docker:

```sh
docker compose build
docker compose up -d
```
