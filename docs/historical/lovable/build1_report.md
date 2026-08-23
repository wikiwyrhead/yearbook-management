# Milestone Yearbook Build 1: Architecture & QA Report

## Overview

Build 1 establishes the multi-tenant foundation for the Milestone Yearbook platform. It handles School and Yearbook management with strict data isolation enforced via Row-Level Security (RLS) and a role-based access control (RBAC) system.

## 1. Verified & Tested

- **Multi-Tenant Isolation**: RLS policies ensure users only see Schools and Yearbooks they are explicitly members of or created.
- **Role-Based Permissions**:
  - `coordinator`: Full management of the yearbook (Team, People, Ladder).
  - `staff`: Ladder editing and People management.
  - `proofreader`: Access to assigned pages.
  - `super_admin`: Global bypass of yearbook-level membership checks.
- **Page Ladder**:
  - Reordering (`position`) and Renumbering (`page_number`) are decoupled.
  - Batch creation supports up to 200 pages at once.
  - Assignments (Designer/Proofreader) are independent per page.
- **People Management**:
  - CSV Import for Students/Faculty with header mapping and duplicate avoidance.
  - Canonical fields (preferred names, student IDs) are strictly typed.
- **Canva Ready**: `canva_design_id` and `canva_design_url` fields are included in the `pages` table, indexed and ready for Phase 2.

## 2. Issues Found & Fixed

- **Role Type Mismatch**: Fixed TypeScript inference issues where `maybeSingle()` results required explicit unwrapping for server function safety.
- **Dashboard Empty States**: Added conditional rendering for cases where a user has schools but no yearbooks, or no schools at all.
- **CSV Parsing**: Enhanced header normalization to handle varying case/spacing in CSV uploads.

## 3. Remaining Risks

- **Large Imports**: CSV imports > 1000 rows might hit server function timeouts; recommend chunking for Phase 2.
- **Recursion Potential**: Security-definer functions (`has_role`) must be carefully monitored to avoid performance overhead on complex joins.

## 4. Architecture Decisions

- **Decoupled Paging**: Internal `position` (integer) determines order; `page_number` (integer/string) is the user-facing print value. This prevents "shifting" bugs when pages are added in the middle.
- **Security Definer Layers**: RLS calls `security definer` functions to bypass policy recursion, but execute permissions are revoked from `public/anon` for security.

## 5. Phase 2 Readiness

The foundation is **READY**.

- Database schema supports asset requirements (`page_requirements`) with `needed/have` counters.
- Page assignments are ready to be used as filters for the Asset Management view.
- Canva fields are live and validated.
