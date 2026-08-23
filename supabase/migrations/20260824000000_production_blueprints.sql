-- ==============================================================================
-- MILESTONE YEARBOOK — PRODUCTION BLUEPRINTS & GOVERNANCE SCHEMA MIGRATION
-- Migration: 20260824000000_production_blueprints.sql
-- ==============================================================================

-- 1. Create Enums Safely
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'page_prep_status') THEN
    CREATE TYPE public.page_prep_status AS ENUM (
      'not_started', 'gathering_content', 'missing_content', 
      'ready_for_editorial_review', 'changes_requested', 
      'ready_for_layout', 'layout_in_progress', 'ready_for_proof'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'proof_page_status') THEN
    CREATE TYPE public.proof_page_status AS ENUM (
      'awaiting_review', 'in_review', 'corrections_requested', 
      'corrections_applied', 'ready_for_verification', 
      'reviewed_and_ready', 'locked_for_round'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'correction_status') THEN
    CREATE TYPE public.correction_status AS ENUM (
      'open', 'acknowledged', 'in_progress', 
      'applied', 'ready_for_verification', 'resolved', 'reopened'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'proof_version_status') THEN
    CREATE TYPE public.proof_version_status AS ENUM (
      'generating', 'open_for_review', 'corrections_in_progress', 
      'ready_to_lock', 'locked', 'final_candidate', 
      'institutionally_approved', 'released_for_production', 'superseded'
    );
  END IF;

  -- Extend yearbook_role enum
  ALTER TYPE public.yearbook_role ADD VALUE IF NOT EXISTS 'editor_in_chief';
  ALTER TYPE public.yearbook_role ADD VALUE IF NOT EXISTS 'advisor';
END $$;

-- 2. Master Composite Unique Constraints
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_pages_composite') THEN
    ALTER TABLE public.pages ADD CONSTRAINT uq_pages_composite UNIQUE (id, yearbook_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_proofs_composite') THEN
    ALTER TABLE public.proofs ADD CONSTRAINT uq_proofs_composite UNIQUE (id, yearbook_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_sections_composite') THEN
    ALTER TABLE public.sections ADD CONSTRAINT uq_sections_composite UNIQUE (id, yearbook_id);
  END IF;
END $$;

-- 3. Catalog Tables
CREATE TABLE IF NOT EXISTS public.section_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3b82f6',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_section_categories_composite UNIQUE (id, yearbook_id)
);

CREATE TABLE IF NOT EXISTS public.layout_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  default_span TEXT NOT NULL DEFAULT 'single_page' CHECK (default_span IN ('single_page', 'facing_spread_left', 'facing_spread_right', 'two_page_spread')),
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_layout_types_composite UNIQUE (id, yearbook_id)
);

-- 4. Extend Pages Table with Navigation & Structural Columns
ALTER TABLE public.pages ADD COLUMN IF NOT EXISTS physical_index INT;
ALTER TABLE public.pages ADD COLUMN IF NOT EXISTS display_page_label TEXT;
ALTER TABLE public.pages ADD COLUMN IF NOT EXISTS is_unnumbered BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.pages ADD COLUMN IF NOT EXISTS section_category_id UUID;
ALTER TABLE public.pages ADD COLUMN IF NOT EXISTS layout_type_id UUID;

-- Backfill physical_index and display_page_label for existing rows
UPDATE public.pages SET physical_index = page_number WHERE physical_index IS NULL;
UPDATE public.pages SET display_page_label = page_number::text WHERE display_page_label IS NULL;

-- 5. Unified Yearbook Subjects Roster (Eliminating Polymorphic FKs)
CREATE TABLE IF NOT EXISTS public.yearbook_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE RESTRICT,
  center_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  person_type TEXT NOT NULL CHECK (person_type IN ('student', 'faculty', 'administrator', 'donor', 'honoree')),
  student_id UUID REFERENCES public.students(id) ON DELETE SET NULL,
  faculty_id UUID REFERENCES public.faculty(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  student_number TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_subject_single_role_link CHECK (NOT (student_id IS NOT NULL AND faculty_id IS NOT NULL)),
  CONSTRAINT uq_yearbook_subjects_composite UNIQUE (id, yearbook_id)
);

-- 6. Page Preparation Tables
CREATE TABLE IF NOT EXISTS public.page_preparation_packets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID NOT NULL,
  yearbook_id UUID NOT NULL,
  spread_index INT,
  school_level TEXT,
  grade_level TEXT,
  strand_or_track TEXT,
  class_section TEXT,
  session_name TEXT,
  captions_and_credits TEXT,
  source_pdf_page INT CHECK (source_pdf_page >= 1 AND source_pdf_page <= 138),
  prep_status public.page_prep_status NOT NULL DEFAULT 'not_started',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (page_id, yearbook_id) REFERENCES public.pages(id, yearbook_id) ON DELETE RESTRICT,
  CONSTRAINT uq_page_prep_packet UNIQUE (page_id)
);

CREATE TABLE IF NOT EXISTS public.page_content_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID NOT NULL,
  yearbook_id UUID NOT NULL,
  block_type TEXT NOT NULL CHECK (block_type IN ('heading', 'subheading', 'body_paragraph', 'quote', 'biography', 'hymn_lyrics', 'letter_text', 'institution_statement')),
  heading_level INT CHECK (heading_level >= 1 AND heading_level <= 6),
  text_content TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (page_id, yearbook_id) REFERENCES public.pages(id, yearbook_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.page_person_appearances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID NOT NULL,
  yearbook_id UUID NOT NULL,
  person_id UUID NOT NULL,
  display_name_snapshot TEXT NOT NULL,
  academic_honor TEXT,
  quoted_text TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (page_id, yearbook_id) REFERENCES public.pages(id, yearbook_id) ON DELETE RESTRICT,
  FOREIGN KEY (person_id, yearbook_id) REFERENCES public.yearbook_subjects(id, yearbook_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.page_asset_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID NOT NULL,
  yearbook_id UUID NOT NULL,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('portrait', 'group_photo', 'candid', 'logo', 'graphic', 'ad_artwork')),
  person_id UUID,
  label TEXT NOT NULL,
  specification TEXT,
  status TEXT NOT NULL DEFAULT 'missing' CHECK (status IN ('missing', 'requested', 'received', 'verified')),
  is_reference_only BOOLEAN NOT NULL DEFAULT false,
  reference_storage_path TEXT,
  high_res_asset_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (page_id, yearbook_id) REFERENCES public.pages(id, yearbook_id) ON DELETE RESTRICT,
  FOREIGN KEY (person_id, yearbook_id) REFERENCES public.yearbook_subjects(id, yearbook_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.missing_content_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID NOT NULL,
  yearbook_id UUID NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('editorial_copy', 'high_res_photo', 'student_name_verification', 'institutional_approval')),
  description TEXT NOT NULL,
  is_resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_by UUID REFERENCES public.users(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (page_id, yearbook_id) REFERENCES public.pages(id, yearbook_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.preparation_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE RESTRICT,
  page_id UUID,
  section_id UUID,
  scope TEXT NOT NULL CHECK (scope IN ('page', 'section', 'edition')),
  stage TEXT NOT NULL CHECK (stage IN ('editorial_member', 'editor_in_chief', 'coordinator', 'principal', 'school_director', 'super_admin')),
  reviewer_user_id UUID NOT NULL REFERENCES public.users(id),
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'changes_requested')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_prep_review_scope_targets CHECK (
    (scope = 'page' AND page_id IS NOT NULL AND section_id IS NULL) OR
    (scope = 'section' AND section_id IS NOT NULL AND page_id IS NULL) OR
    (scope = 'edition' AND page_id IS NULL AND section_id IS NULL)
  )
);

-- 7. Proofing, Multi-Round & Governance Tables
CREATE TABLE IF NOT EXISTS public.proof_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proof_id UUID NOT NULL REFERENCES public.proofs(id) ON DELETE CASCADE,
  page_id UUID NOT NULL REFERENCES public.pages(id) ON DELETE CASCADE,
  yearbook_id UUID REFERENCES public.yearbooks(id) ON DELETE CASCADE,
  page_number INT,
  status public.proof_page_status NOT NULL DEFAULT 'awaiting_review',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (proof_id, page_id)
);

ALTER TABLE public.proof_pages ADD COLUMN IF NOT EXISTS yearbook_id UUID REFERENCES public.yearbooks(id);
ALTER TABLE public.proof_pages ADD COLUMN IF NOT EXISTS page_number INT;
ALTER TABLE public.proof_pages ADD COLUMN IF NOT EXISTS status public.proof_page_status NOT NULL DEFAULT 'awaiting_review';

ALTER TABLE public.proofs ADD COLUMN IF NOT EXISTS round_number INT;
ALTER TABLE public.proofs ADD COLUMN IF NOT EXISTS round_name TEXT;
ALTER TABLE public.proofs ADD COLUMN IF NOT EXISTS proof_version_status public.proof_version_status NOT NULL DEFAULT 'open_for_review';
ALTER TABLE public.proofs ADD COLUMN IF NOT EXISTS file_path TEXT;
ALTER TABLE public.proofs ADD COLUMN IF NOT EXISTS checksum_sha256 TEXT;
ALTER TABLE public.proofs ADD COLUMN IF NOT EXISTS generated_by UUID REFERENCES public.users(id);
ALTER TABLE public.proofs ADD COLUMN IF NOT EXISTS generated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.proofs ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;
ALTER TABLE public.proofs ADD COLUMN IF NOT EXISTS locked_by UUID REFERENCES public.users(id);
ALTER TABLE public.proofs ADD COLUMN IF NOT EXISTS lock_notes TEXT;

-- Backfill distinct round_number and round_name per yearbook
WITH ranked_proofs AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY yearbook_id ORDER BY created_at ASC) as r_num
  FROM public.proofs
)
UPDATE public.proofs p
SET round_number = r.r_num,
    round_name = 'Proofreading Round ' || r.r_num
FROM ranked_proofs r
WHERE p.id = r.id;

ALTER TABLE public.proofs ALTER COLUMN round_number SET NOT NULL;
ALTER TABLE public.proofs ALTER COLUMN round_name SET NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_proof_round') THEN
    ALTER TABLE public.proofs ADD CONSTRAINT uq_proof_round UNIQUE (yearbook_id, round_number);
  END IF;
END $$;

-- Proof Access Grants (Zero Arrays)
CREATE TABLE IF NOT EXISTS public.proof_access_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE RESTRICT,
  proof_id UUID,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  can_view BOOLEAN NOT NULL DEFAULT true,
  can_comment BOOLEAN NOT NULL DEFAULT false,
  can_attach BOOLEAN NOT NULL DEFAULT false,
  granted_by UUID NOT NULL REFERENCES public.users(id),
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (proof_id, yearbook_id) REFERENCES public.proofs(id, yearbook_id) ON DELETE RESTRICT,
  CONSTRAINT uq_proof_access_grants_composite UNIQUE (id, yearbook_id)
);

CREATE TABLE IF NOT EXISTS public.proof_access_grant_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id UUID NOT NULL,
  page_id UUID NOT NULL,
  yearbook_id UUID NOT NULL,
  FOREIGN KEY (grant_id, yearbook_id) REFERENCES public.proof_access_grants(id, yearbook_id) ON DELETE CASCADE,
  FOREIGN KEY (page_id, yearbook_id) REFERENCES public.pages(id, yearbook_id) ON DELETE CASCADE,
  CONSTRAINT uq_grant_page UNIQUE (grant_id, page_id)
);

CREATE TABLE IF NOT EXISTS public.proof_access_grant_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id UUID NOT NULL,
  section_id UUID NOT NULL,
  yearbook_id UUID NOT NULL,
  FOREIGN KEY (grant_id, yearbook_id) REFERENCES public.proof_access_grants(id, yearbook_id) ON DELETE CASCADE,
  FOREIGN KEY (section_id, yearbook_id) REFERENCES public.sections(id, yearbook_id) ON DELETE CASCADE,
  CONSTRAINT uq_grant_section UNIQUE (grant_id, section_id)
);

-- Authoritative Proof Reviewer Assignments
CREATE TABLE IF NOT EXISTS public.proof_reviewer_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proof_id UUID NOT NULL,
  yearbook_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  role_snapshot TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('page', 'section', 'edition')),
  target_page_id UUID,
  target_section_id UUID,
  is_required BOOLEAN NOT NULL DEFAULT true,
  assigned_by UUID NOT NULL REFERENCES public.users(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  due_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  replaced_by_assignment_id UUID REFERENCES public.proof_reviewer_assignments(id),
  FOREIGN KEY (proof_id, yearbook_id) REFERENCES public.proofs(id, yearbook_id) ON DELETE RESTRICT,
  CONSTRAINT chk_reviewer_assignment_targets CHECK (
    (scope = 'page' AND target_page_id IS NOT NULL AND target_section_id IS NULL) OR
    (scope = 'section' AND target_section_id IS NOT NULL AND target_page_id IS NULL) OR
    (scope = 'edition' AND target_page_id IS NULL AND target_section_id IS NULL)
  )
);

-- Proof Page Reviewer Completions
CREATE TABLE IF NOT EXISTS public.proof_page_reviewer_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES public.proof_reviewer_assignments(id) ON DELETE RESTRICT,
  proof_id UUID NOT NULL,
  page_id UUID NOT NULL,
  yearbook_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  FOREIGN KEY (proof_id, yearbook_id) REFERENCES public.proofs(id, yearbook_id) ON DELETE RESTRICT,
  FOREIGN KEY (page_id, yearbook_id) REFERENCES public.pages(id, yearbook_id) ON DELETE RESTRICT,
  CONSTRAINT uq_reviewer_page_completion UNIQUE (proof_id, page_id, user_id)
);

-- Corrections with Numeric Percentage Bounding & Anchors
ALTER TABLE public.corrections ADD COLUMN IF NOT EXISTS x_percent NUMERIC(5,2) NOT NULL DEFAULT 50.0 CHECK (x_percent >= 0 AND x_percent <= 100);
ALTER TABLE public.corrections ADD COLUMN IF NOT EXISTS y_percent NUMERIC(5,2) NOT NULL DEFAULT 50.0 CHECK (y_percent >= 0 AND y_percent <= 100);
ALTER TABLE public.corrections ADD COLUMN IF NOT EXISTS width_percent NUMERIC(5,2) CHECK (width_percent > 0 AND width_percent <= 100 AND (x_percent + width_percent) <= 100);
ALTER TABLE public.corrections ADD COLUMN IF NOT EXISTS height_percent NUMERIC(5,2) CHECK (height_percent > 0 AND height_percent <= 100 AND (y_percent + height_percent) <= 100);
ALTER TABLE public.corrections ADD COLUMN IF NOT EXISTS correction_status public.correction_status NOT NULL DEFAULT 'open';
ALTER TABLE public.corrections ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES public.users(id);
ALTER TABLE public.corrections ADD COLUMN IF NOT EXISTS carried_from_id UUID REFERENCES public.corrections(id);

CREATE TABLE IF NOT EXISTS public.correction_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  correction_id UUID NOT NULL REFERENCES public.corrections(id) ON DELETE RESTRICT,
  proof_id UUID NOT NULL,
  yearbook_id UUID NOT NULL,
  storage_provider_file_id TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL CHECK (file_size_bytes > 0 AND file_size_bytes <= 26214400),
  checksum_sha256 TEXT NOT NULL,
  validation_status TEXT NOT NULL CHECK (validation_status IN ('pending', 'validated', 'rejected')),
  validation_notes TEXT,
  uploaded_by UUID NOT NULL REFERENCES public.users(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (proof_id, yearbook_id) REFERENCES public.proofs(id, yearbook_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.correction_reference_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  correction_id UUID NOT NULL REFERENCES public.corrections(id) ON DELETE RESTRICT,
  proof_id UUID NOT NULL,
  yearbook_id UUID NOT NULL,
  url TEXT NOT NULL CHECK (url ~* '^https?://'),
  title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (proof_id, yearbook_id) REFERENCES public.proofs(id, yearbook_id) ON DELETE RESTRICT
);

-- Governance Signoffs (Decoupled Requirements & Append-Only Decisions)
CREATE TABLE IF NOT EXISTS public.proof_signoff_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proof_id UUID NOT NULL,
  yearbook_id UUID NOT NULL,
  signatory_role TEXT NOT NULL CHECK (signatory_role IN ('editor_in_chief', 'coordinator', 'principal', 'school_director')),
  designated_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  assigned_by UUID NOT NULL REFERENCES public.users(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true,
  revoked_at TIMESTAMPTZ,
  replaced_by_requirement_id UUID REFERENCES public.proof_signoff_requirements(id),
  FOREIGN KEY (proof_id, yearbook_id) REFERENCES public.proofs(id, yearbook_id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_active_proof_signoff_role 
  ON public.proof_signoff_requirements (proof_id, signatory_role) 
  WHERE is_active = true;

CREATE TABLE IF NOT EXISTS public.proof_signoff_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requirement_id UUID NOT NULL REFERENCES public.proof_signoff_requirements(id) ON DELETE RESTRICT,
  proof_id UUID NOT NULL,
  yearbook_id UUID NOT NULL,
  pdf_checksum_sha256 TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES public.users(id),
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'approved_with_notes', 'changes_requested')),
  notes TEXT,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (proof_id, yearbook_id) REFERENCES public.proofs(id, yearbook_id) ON DELETE RESTRICT
);

-- Production Release Emergency Overrides
CREATE TABLE IF NOT EXISTS public.production_release_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE RESTRICT,
  proof_id UUID NOT NULL,
  pdf_checksum_sha256 TEXT NOT NULL,
  authorized_by_super_admin_id UUID NOT NULL REFERENCES public.users(id),
  written_justification TEXT NOT NULL CHECK (length(written_justification) >= 25),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (proof_id, yearbook_id) REFERENCES public.proofs(id, yearbook_id) ON DELETE RESTRICT
);

-- Signoff Reminders Engine
CREATE TABLE IF NOT EXISTS public.signoff_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE RESTRICT,
  proof_id UUID NOT NULL,
  recipient_user_id UUID NOT NULL REFERENCES public.users(id),
  recipient_role TEXT NOT NULL,
  notification_type TEXT NOT NULL CHECK (notification_type IN ('signoff_pending', 'changes_requested', 'round_superseded', 'round_locked')),
  dedup_key TEXT UNIQUE NOT NULL,
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (proof_id, yearbook_id) REFERENCES public.proofs(id, yearbook_id) ON DELETE RESTRICT
);

-- 8. Database Triggers for Locked-Proof Immutability
CREATE OR REPLACE FUNCTION public.fn_enforce_proof_immutability()
RETURNS TRIGGER AS $$
BEGIN
  -- If previous status was locked or finalized, only permit valid status transitions
  IF OLD.proof_version_status IN ('locked', 'final_candidate', 'institutionally_approved', 'released_for_production', 'superseded') THEN
    -- Block altering immutable identity fields
    IF NEW.file_path <> OLD.file_path OR 
       NEW.checksum_sha256 <> OLD.checksum_sha256 OR 
       NEW.round_number <> OLD.round_number OR 
       NEW.yearbook_id <> OLD.yearbook_id OR 
       NEW.generated_by <> OLD.generated_by OR
       NEW.locked_at IS DISTINCT FROM OLD.locked_at OR
       NEW.locked_by IS DISTINCT FROM OLD.locked_by THEN
      RAISE EXCEPTION 'Cannot modify identity, file path, checksum, or round number of a locked proof version';
    END IF;

    -- Validate legal status-only transitions
    IF OLD.proof_version_status = 'locked' AND NEW.proof_version_status NOT IN ('locked', 'final_candidate', 'superseded') THEN
      RAISE EXCEPTION 'Illegal status transition from locked to %', NEW.proof_version_status;
    ELSIF OLD.proof_version_status = 'final_candidate' AND NEW.proof_version_status NOT IN ('final_candidate', 'institutionally_approved', 'superseded') THEN
      RAISE EXCEPTION 'Illegal status transition from final_candidate to %', NEW.proof_version_status;
    ELSIF OLD.proof_version_status = 'institutionally_approved' AND NEW.proof_version_status NOT IN ('institutionally_approved', 'released_for_production', 'superseded') THEN
      RAISE EXCEPTION 'Illegal status transition from institutionally_approved to %', NEW.proof_version_status;
    ELSIF OLD.proof_version_status IN ('released_for_production', 'superseded') AND NEW.proof_version_status <> OLD.proof_version_status THEN
      RAISE EXCEPTION 'Cannot change status of a finalized or superseded proof version (%)', OLD.proof_version_status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_proof_immutability ON public.proofs;
CREATE TRIGGER trg_enforce_proof_immutability
  BEFORE UPDATE ON public.proofs
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_enforce_proof_immutability();

-- Prevent child modifications on locked/finalized/superseded proof versions
CREATE OR REPLACE FUNCTION public.fn_prevent_locked_child_mutation()
RETURNS TRIGGER AS $$
DECLARE
  v_proof_status public.proof_version_status;
  v_proof_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_proof_id := OLD.proof_id;
  ELSE
    v_proof_id := NEW.proof_id;
  END IF;

  SELECT proof_version_status INTO v_proof_status 
  FROM public.proofs 
  WHERE id = v_proof_id;

  IF v_proof_status IS NOT NULL AND v_proof_status IN ('locked', 'final_candidate', 'institutionally_approved', 'released_for_production', 'superseded') THEN
    RAISE EXCEPTION 'Cannot insert, update, or delete child records for locked, finalized, or superseded proof version % (status: %)', v_proof_id, v_proof_status;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_locked_proof_pages_mutation ON public.proof_pages;
CREATE TRIGGER trg_prevent_locked_proof_pages_mutation
  BEFORE INSERT OR UPDATE OR DELETE ON public.proof_pages
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_prevent_locked_child_mutation();

DROP TRIGGER IF EXISTS trg_prevent_locked_reviewer_assignment_mutation ON public.proof_reviewer_assignments;
CREATE TRIGGER trg_prevent_locked_reviewer_assignment_mutation
  BEFORE INSERT OR UPDATE OR DELETE ON public.proof_reviewer_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_prevent_locked_child_mutation();

DROP TRIGGER IF EXISTS trg_prevent_locked_reviewer_completion ON public.proof_page_reviewer_completions;
CREATE TRIGGER trg_prevent_locked_reviewer_completion
  BEFORE INSERT OR UPDATE OR DELETE ON public.proof_page_reviewer_completions
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_prevent_locked_child_mutation();

DROP TRIGGER IF EXISTS trg_prevent_locked_correction_mutation ON public.corrections;
CREATE TRIGGER trg_prevent_locked_correction_mutation
  BEFORE INSERT OR UPDATE OR DELETE ON public.corrections
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_prevent_locked_child_mutation();

DROP TRIGGER IF EXISTS trg_prevent_locked_attachment_mutation ON public.correction_attachments;
CREATE TRIGGER trg_prevent_locked_attachment_mutation
  BEFORE INSERT OR UPDATE OR DELETE ON public.correction_attachments
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_prevent_locked_child_mutation();

DROP TRIGGER IF EXISTS trg_prevent_locked_reference_links_mutation ON public.correction_reference_links;
CREATE TRIGGER trg_prevent_locked_reference_links_mutation
  BEFORE INSERT OR UPDATE OR DELETE ON public.correction_reference_links
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_prevent_locked_child_mutation();

-- Signoff Immutability Trigger (Allows INSERT in final_candidate, strictly append-only, blocks once locked)
CREATE OR REPLACE FUNCTION public.fn_prevent_locked_signoff_mutation()
RETURNS TRIGGER AS $$
DECLARE
  v_proof_id UUID;
  v_proof_status public.proof_version_status;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_proof_id := OLD.proof_id;
  ELSE
    v_proof_id := NEW.proof_id;
  END IF;

  SELECT proof_version_status INTO v_proof_status 
  FROM public.proofs 
  WHERE id = v_proof_id;

  -- Block mutations once round is locked, approved, released, or superseded
  IF v_proof_status IS NOT NULL AND v_proof_status IN ('locked', 'institutionally_approved', 'released_for_production', 'superseded') THEN
    RAISE EXCEPTION 'Cannot modify signoff requirements or decisions for locked, approved, or superseded proof version % (status: %)', v_proof_id, v_proof_status;
  END IF;

  -- Decisions are strictly append-only
  IF TG_TABLE_NAME = 'proof_signoff_decisions' AND TG_OP IN ('UPDATE', 'DELETE') THEN
    RAISE EXCEPTION 'Proof signoff decisions are strictly append-only and cannot be updated or deleted.';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_locked_signoff_req_mutation ON public.proof_signoff_requirements;
CREATE TRIGGER trg_prevent_locked_signoff_req_mutation
  BEFORE INSERT OR UPDATE OR DELETE ON public.proof_signoff_requirements
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_prevent_locked_signoff_mutation();

DROP TRIGGER IF EXISTS trg_prevent_locked_signoff_dec_mutation ON public.proof_signoff_decisions;
CREATE TRIGGER trg_prevent_locked_signoff_dec_mutation
  BEFORE INSERT OR UPDATE OR DELETE ON public.proof_signoff_decisions
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_prevent_locked_signoff_mutation();
