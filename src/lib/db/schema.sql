
-- ==================================================
-- MILESTONE YEARBOOK — COMPLETE LOCAL POSTGRESQL SCHEMA
-- ==================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- --------------------------------------------------
-- 1. ENUMS
-- --------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('super_admin', 'coordinator', 'member', 'student');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.yearbook_role AS ENUM ('coordinator', 'staff', 'proofreader', 'corrector', 'student');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.asset_type AS ENUM ('photo', 'graphic', 'cover', 'template', 'document');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.asset_status AS ENUM ('raw', 'processed', 'approved', 'rejected', 'archived');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.asset_visibility AS ENUM ('public', 'private', 'restricted');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.correction_status AS ENUM ('open', 'acknowledged', 'in_progress', 'resolved', 'verified');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.correction_severity AS ENUM ('low', 'medium', 'high', 'critical');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.proof_status AS ENUM ('draft', 'ready', 'rejected', 'approved');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.proof_type AS ENUM ('spread', 'section', 'full', 'sample');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- --------------------------------------------------
-- 2. AUTH & USER TABLES
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sessions (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- --------------------------------------------------
-- 3. HELPER FUNCTIONS
-- --------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT public.has_role(_user_id, 'super_admin'::public.app_role);
$$;

-- --------------------------------------------------
-- 4. DOMAIN ENTITIES: SCHOOLS & YEARBOOKS
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.schools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  short_name TEXT,
  logo_url TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  country TEXT DEFAULT 'US',
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  notes TEXT,
  created_by UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.yearbooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  title TEXT,
  theme TEXT,
  page_count INTEGER NOT NULL DEFAULT 0,
  deadline DATE,
  is_locked BOOLEAN NOT NULL DEFAULT false,
  locked_by UUID REFERENCES public.users(id),
  locked_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, year)
);

-- Standardized view for Centers
CREATE OR REPLACE VIEW public.centers AS
SELECT * FROM public.schools;

-- Center Memberships (Permanent affiliations: Teacher, Student)
CREATE TABLE IF NOT EXISTS public.center_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  member_type TEXT NOT NULL CHECK (member_type IN ('teacher', 'student', 'staff')),
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  assigned_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_center_membership_dates CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_active_center_membership
  ON public.center_memberships (center_id, user_id)
  WHERE is_active = true;

-- Center Role Appointments (Ongoing Coordinator appointment)
CREATE TABLE IF NOT EXISTS public.center_role_appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  role TEXT NOT NULL DEFAULT 'coordinator' CHECK (role = 'coordinator'),
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  assigned_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_center_appointment_dates CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_active_coordinator_appointment
  ON public.center_role_appointments (center_id, user_id)
  WHERE is_active = true AND role = 'coordinator';

-- Annual Yearbook Team Assignments
CREATE TABLE IF NOT EXISTS public.yearbook_team_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  center_membership_id UUID REFERENCES public.center_memberships(id) ON DELETE SET NULL,
  role TEXT NOT NULL CHECK (role IN ('advisor', 'editorial_member', 'student_contributor')),
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  assigned_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_yearbook_assignment_dates CHECK (end_date IS NULL OR end_date >= start_date),
  CONSTRAINT uq_yearbook_assignment_composite UNIQUE (id, yearbook_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_active_yearbook_assignment
  ON public.yearbook_team_assignments (yearbook_id, user_id, role)
  WHERE is_active = true;

-- Backwards compatibility table/view
CREATE TABLE IF NOT EXISTS public.yearbook_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role public.yearbook_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (yearbook_id, user_id, role)
);

-- Authorization Functions
CREATE OR REPLACE FUNCTION public.is_active_coordinator(_user_id uuid, _center_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT public.is_super_admin(_user_id) OR EXISTS (
    SELECT 1 FROM public.center_role_appointments
    WHERE user_id = _user_id
      AND center_id = _center_id
      AND role = 'coordinator'
      AND is_active = true
      AND start_date <= CURRENT_DATE
      AND (end_date IS NULL OR end_date >= CURRENT_DATE)
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_center_roles(_user_id uuid, _center_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT public.is_super_admin(_user_id);
$$;

CREATE OR REPLACE FUNCTION public.can_manage_yearbook(_user_id uuid, _yearbook_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT public.is_super_admin(_user_id) OR EXISTS (
    SELECT 1 FROM public.yearbooks y
    JOIN public.center_role_appointments a ON a.center_id = y.school_id
    WHERE y.id = _yearbook_id
      AND a.user_id = _user_id
      AND a.role = 'coordinator'
      AND a.is_active = true
      AND a.start_date <= CURRENT_DATE
      AND (a.end_date IS NULL OR a.end_date >= CURRENT_DATE)
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_editorial_team(_user_id uuid, _yearbook_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT public.can_manage_yearbook(_user_id, _yearbook_id);
$$;

CREATE OR REPLACE FUNCTION public.can_approve_and_lock(_user_id uuid, _yearbook_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT public.can_manage_yearbook(_user_id, _yearbook_id);
$$;

CREATE OR REPLACE FUNCTION public.can_access_school(_user_id uuid, _school_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT public.is_super_admin(_user_id)
    OR public.is_active_coordinator(_user_id, _school_id)
    OR EXISTS (
      SELECT 1 FROM public.center_memberships m
      WHERE m.center_id = _school_id AND m.user_id = _user_id AND m.is_active = true
    )
    OR EXISTS (
      SELECT 1 FROM public.yearbooks y
      JOIN public.yearbook_team_assignments a ON a.yearbook_id = y.id
      WHERE y.school_id = _school_id AND a.user_id = _user_id AND a.is_active = true
    );
$$;

CREATE OR REPLACE FUNCTION public.is_yearbook_locked(yb_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT COALESCE((SELECT is_locked FROM public.yearbooks WHERE id = yb_id), false);
$$;

-- --------------------------------------------------
-- 5. LADDERS, SECTIONS, PAGES, ROSTER
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#64748b',
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, yearbook_id)
);

CREATE TABLE IF NOT EXISTS public.page_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.page_statuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#64748b',
  position INTEGER NOT NULL DEFAULT 0,
  is_terminal BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  grade TEXT,
  homeroom TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
  class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  student_number TEXT,
  first_name TEXT NOT NULL,
  middle_name TEXT,
  last_name TEXT NOT NULL,
  preferred_name TEXT,
  suffix TEXT,
  grade TEXT,
  homeroom TEXT,
  email TEXT,
  submission_status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.faculty (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  first_name TEXT NOT NULL,
  middle_name TEXT,
  last_name TEXT NOT NULL,
  preferred_name TEXT,
  suffix TEXT,
  title TEXT,
  department TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
  section_id UUID REFERENCES public.sections(id) ON DELETE SET NULL,
  page_type_id UUID REFERENCES public.page_types(id) ON DELETE SET NULL,
  status_id UUID REFERENCES public.page_statuses(id) ON DELETE SET NULL,
  position INTEGER NOT NULL DEFAULT 0,
  page_number INTEGER,
  title TEXT,
  description TEXT,
  required_assets TEXT,
  notes TEXT,
  blocking_reason TEXT,
  design_status TEXT DEFAULT 'not_ready',
  canva_design_id TEXT,
  canva_design_name TEXT,
  canva_design_url TEXT,
  canva_synced_at TIMESTAMPTZ,
  design_readiness_override BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, yearbook_id)
);

-- Relational Page & Section Assignments with Composite Foreign Keys
CREATE TABLE IF NOT EXISTS public.yearbook_assignment_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL,
  page_id UUID NOT NULL,
  yearbook_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (assignment_id, yearbook_id) REFERENCES public.yearbook_team_assignments(id, yearbook_id) ON DELETE CASCADE,
  FOREIGN KEY (page_id, yearbook_id) REFERENCES public.pages(id, yearbook_id) ON DELETE CASCADE,
  UNIQUE (assignment_id, page_id)
);

CREATE TABLE IF NOT EXISTS public.yearbook_assignment_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL,
  section_id UUID NOT NULL,
  yearbook_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (assignment_id, yearbook_id) REFERENCES public.yearbook_team_assignments(id, yearbook_id) ON DELETE CASCADE,
  FOREIGN KEY (section_id, yearbook_id) REFERENCES public.sections(id, yearbook_id) ON DELETE CASCADE,
  UNIQUE (assignment_id, section_id)
);

CREATE OR REPLACE FUNCTION public.can_edit_assigned_page(_user_id uuid, _yearbook_id uuid, _page_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT public.is_super_admin(_user_id)
    OR public.can_manage_yearbook(_user_id, _yearbook_id)
    OR EXISTS (
      SELECT 1 FROM public.yearbook_team_assignments a
      WHERE a.yearbook_id = _yearbook_id
        AND a.user_id = _user_id
        AND a.role = 'advisor'
        AND a.is_active = true
        AND a.start_date <= CURRENT_DATE
        AND (a.end_date IS NULL OR a.end_date >= CURRENT_DATE)
    )
    OR EXISTS (
      SELECT 1 FROM public.yearbook_team_assignments a
      LEFT JOIN public.yearbook_assignment_pages ap ON ap.assignment_id = a.id
      LEFT JOIN public.yearbook_assignment_sections asec ON asec.assignment_id = a.id
      LEFT JOIN public.pages p ON p.id = _page_id
      WHERE a.yearbook_id = _yearbook_id
        AND a.user_id = _user_id
        AND a.role = 'editorial_member'
        AND a.is_active = true
        AND a.start_date <= CURRENT_DATE
        AND (a.end_date IS NULL OR a.end_date >= CURRENT_DATE)
        AND (ap.page_id = _page_id OR (asec.section_id IS NOT NULL AND asec.section_id = p.section_id))
    );
$$;

CREATE OR REPLACE FUNCTION public.can_review_proof_page(_user_id uuid, _yearbook_id uuid, _page_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT public.can_edit_assigned_page(_user_id, _yearbook_id, _page_id);
$$;

CREATE TABLE IF NOT EXISTS public.page_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID NOT NULL REFERENCES public.pages(id) ON DELETE CASCADE,
  yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  needed INTEGER NOT NULL DEFAULT 0,
  have INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.page_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID NOT NULL REFERENCES public.pages(id) ON DELETE CASCADE,
  yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'designer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (page_id, user_id, kind)
);

-- --------------------------------------------------
-- 6. ASSETS & STORAGE
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
  title TEXT,
  description TEXT,
  file_name TEXT,
  file_type TEXT,
  file_path TEXT,
  file_size BIGINT NOT NULL DEFAULT 0,
  mime_type TEXT,
  storage_path TEXT,
  width INTEGER,
  height INTEGER,
  asset_type TEXT NOT NULL DEFAULT 'photo',
  status TEXT NOT NULL DEFAULT 'uploaded',
  visibility TEXT NOT NULL DEFAULT 'private',
  storage_provider TEXT DEFAULT 'supabase',
  external_file_id TEXT,
  external_folder_id TEXT,
  external_url TEXT,
  external_filename TEXT,
  source_metadata JSONB DEFAULT '{}'::jsonb,
  imported_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  category TEXT,
  notes TEXT,
  student_id UUID REFERENCES public.students(id) ON DELETE SET NULL,
  faculty_id UUID REFERENCES public.faculty(id) ON DELETE SET NULL,
  class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  section_id UUID REFERENCES public.sections(id) ON DELETE SET NULL,
  version INTEGER NOT NULL DEFAULT 1,
  validation_metadata JSONB DEFAULT '{}'::jsonb,
  tags TEXT[] DEFAULT '{}',
  is_current BOOLEAN NOT NULL DEFAULT true,
  uploaded_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.page_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID NOT NULL REFERENCES public.pages(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  requirement_id UUID REFERENCES public.page_requirements(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (page_id, asset_id)
);

-- asset_audit_log is defined in section 7 (Proofing & Production) with full column set

CREATE TABLE IF NOT EXISTS public.upload_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  invited_by UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- --------------------------------------------------
-- 7. PROOFING & PRODUCTION
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.proofs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  round_number INTEGER NOT NULL DEFAULT 1,
  round_name TEXT,
  round_classification TEXT NOT NULL DEFAULT 'unknown',
  official_round_number INTEGER,
  proof_type public.proof_type NOT NULL DEFAULT 'full',
  proof_version_status TEXT NOT NULL DEFAULT 'open_for_review',
  pdf_storage_path TEXT DEFAULT '',
  storage_path TEXT,
  canva_export_id TEXT,
  status public.proof_status NOT NULL DEFAULT 'ready',
  page_count INTEGER NOT NULL DEFAULT 0,
  checksum_sha256 TEXT,
  notes TEXT,
  lock_notes TEXT,
  locked_at TIMESTAMPTZ,
  locked_by UUID REFERENCES public.users(id),
  created_by UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_proof_round_classification_enum CHECK (
    round_classification IN ('official_master', 'legacy_preview', 'development_test', 'unknown')
  ),
  CONSTRAINT chk_proof_official_round_number CHECK (
    (round_classification = 'official_master' AND official_round_number IS NOT NULL AND official_round_number > 0)
    OR
    (round_classification != 'official_master' AND official_round_number IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_official_round_number
  ON public.proofs (yearbook_id, official_round_number)
  WHERE round_classification = 'official_master';

CREATE TABLE IF NOT EXISTS public.proof_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proof_id UUID NOT NULL REFERENCES public.proofs(id) ON DELETE CASCADE,
  page_id UUID NOT NULL REFERENCES public.pages(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (proof_id, page_id)
);

CREATE TABLE IF NOT EXISTS public.corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
  proof_id UUID REFERENCES public.proofs(id) ON DELETE SET NULL,
  page_id UUID REFERENCES public.pages(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL DEFAULT 0,
  annotation_type TEXT DEFAULT 'comment',
  title TEXT NOT NULL,
  description TEXT,
  coordinates JSONB NOT NULL DEFAULT '{"x":50,"y":50}'::jsonb,
  category TEXT DEFAULT 'general',
  priority TEXT DEFAULT 'medium',
  severity public.correction_severity NOT NULL DEFAULT 'medium',
  status public.correction_status NOT NULL DEFAULT 'open',
  resolution_notes TEXT,
  resolved_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES public.users(id),
  assigned_to UUID REFERENCES public.users(id),
  resolved_by UUID REFERENCES public.users(id),
  verified_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.correction_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  correction_id UUID NOT NULL REFERENCES public.corrections(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.page_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
  page_id UUID NOT NULL REFERENCES public.pages(id) ON DELETE CASCADE,
  proof_id UUID REFERENCES public.proofs(id) ON DELETE SET NULL,
  approved_by UUID NOT NULL REFERENCES public.users(id),
  approved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  is_current BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (page_id)
);

CREATE TABLE IF NOT EXISTS public.yearbook_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
  proof_id UUID REFERENCES public.proofs(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES public.users(id),
  created_by UUID REFERENCES public.users(id),
  approved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'approved',
  reason TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS public.proofreader_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
  page_id UUID REFERENCES public.pages(id) ON DELETE CASCADE,
  page_type_id UUID REFERENCES public.page_types(id) ON DELETE CASCADE,
  category TEXT,
  position INTEGER DEFAULT 0,
  item_key TEXT NOT NULL,
  item_text TEXT,
  is_checked BOOLEAN NOT NULL DEFAULT false,
  checked_by UUID REFERENCES public.users(id),
  checked_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.page_checklist_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID NOT NULL REFERENCES public.pages(id) ON DELETE CASCADE,
  proof_id UUID REFERENCES public.proofs(id) ON DELETE CASCADE,
  checklist_id UUID NOT NULL REFERENCES public.proofreader_checklists(id) ON DELETE CASCADE,
  is_checked BOOLEAN DEFAULT false,
  updated_by UUID REFERENCES public.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (page_id, proof_id, checklist_id)
);

CREATE TABLE IF NOT EXISTS public.yearbook_lock_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  reason TEXT,
  user_id UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.production_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  snapshot_data JSONB NOT NULL,
  created_by UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.preflight_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
  snapshot_id UUID REFERENCES public.production_snapshots(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'PASS',
  blocking_issues JSONB DEFAULT '[]'::jsonb,
  warnings JSONB DEFAULT '[]'::jsonb,
  results JSONB DEFAULT '{}'::jsonb,
  run_by UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.production_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
  snapshot_id UUID NOT NULL REFERENCES public.production_snapshots(id) ON DELETE CASCADE,
  manifest JSONB NOT NULL,
  storage_path TEXT NOT NULL,
  checksum_sha256 TEXT NOT NULL,
  generated_by UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.service_bureaus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT UNIQUE,
  contact_email TEXT,
  contact_phone TEXT,
  website_url TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.service_bureau_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
  snapshot_id UUID REFERENCES public.production_snapshots(id) ON DELETE SET NULL,
  package_id UUID REFERENCES public.production_packages(id) ON DELETE CASCADE,
  service_bureau_id UUID REFERENCES public.service_bureaus(id) ON DELETE SET NULL,
  bureau_name TEXT DEFAULT '',
  bureau_order_id TEXT,
  external_reference TEXT,
  status TEXT NOT NULL DEFAULT 'READY',
  notes TEXT,
  tracking_url TEXT,
  submitted_by UUID REFERENCES public.users(id),
  submitted_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.production_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES public.users(id),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.yearbook_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'coordinator',
  status TEXT NOT NULL DEFAULT 'pending',
  invited_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  accepted_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '7 days'),
  token TEXT UNIQUE DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (yearbook_id, email, role)
);

-- asset_audit_log: extended with yearbook context and status tracking
CREATE TABLE IF NOT EXISTS public.asset_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  yearbook_id UUID REFERENCES public.yearbooks(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  old_status TEXT,
  new_status TEXT,
  performed_by UUID NOT NULL REFERENCES public.users(id),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- --------------------------------------------------
-- 8. EXTERNAL PROVIDERS SETTINGS & CONNECTIONS
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organization_storage_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL UNIQUE,
  display_name TEXT,
  root_folder_id TEXT,
  root_folder_path TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  credentials JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.center_storage_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'google_drive',
  credentials JSONB NOT NULL DEFAULT '{}'::jsonb,
  account_email TEXT,
  scopes TEXT[] DEFAULT ARRAY['https://www.googleapis.com/auth/drive.file']::text[],
  status TEXT NOT NULL DEFAULT 'connected',
  root_folder_id TEXT,
  connected_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (center_id, provider)
);

CREATE TABLE IF NOT EXISTS public.yearbook_storage_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE UNIQUE,
  center_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
  mode TEXT NOT NULL DEFAULT 'inherit_center',
  provider TEXT,
  folder_id TEXT,
  folder_path TEXT,
  assets_folder_id TEXT,
  portraits_folder_id TEXT,
  proofs_folder_id TEXT,
  production_folder_id TEXT,
  allow_member_sources BOOLEAN NOT NULL DEFAULT true,
  additional_providers TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.member_storage_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  credentials JSONB NOT NULL DEFAULT '{}'::jsonb,
  account_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);

CREATE TABLE IF NOT EXISTS public.canva_user_connections (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  canva_user_id TEXT,
  team_id TEXT,
  display_name TEXT,
  credentials JSONB NOT NULL DEFAULT '{}'::jsonb,
  scopes TEXT[] NOT NULL DEFAULT '{}'::text[],
  status TEXT NOT NULL DEFAULT 'connected',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.canva_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE UNIQUE,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  canva_user_id TEXT,
  team_id TEXT,
  folder_id TEXT,
  brand_template_id TEXT,
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.canva_designs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
  page_id UUID REFERENCES public.pages(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  canva_design_id TEXT NOT NULL,
  title TEXT,
  thumbnail_url TEXT,
  edit_url TEXT,
  view_url TEXT,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (yearbook_id, canva_design_id)
);

-- ============================================================================
-- Hidden Super-Admin Design Provider Architecture (Additive Domain Models)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.design_provider_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL CHECK (provider IN ('canva', 'adobe_express')),
  connected_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  encrypted_credentials JSONB,
  external_user_id TEXT,
  external_team_id TEXT,
  display_name TEXT,
  scopes TEXT[],
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'disconnected', 'needs_reauthorization', 'error')),
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  disconnected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT check_active_credentials_required CHECK (
    (is_active = false OR status = 'disconnected') OR (encrypted_credentials IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS design_provider_connections_active_provider_idx
ON public.design_provider_connections (provider) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS public.yearbook_design_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
  provider_connection_id UUID NOT NULL REFERENCES public.design_provider_connections(id) ON DELETE RESTRICT,
  external_design_id TEXT NOT NULL,
  external_design_title TEXT NOT NULL,
  assigned_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true,
  replaced_at TIMESTAMPTZ,
  replaced_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT yearbook_design_bindings_composite_key UNIQUE (id, yearbook_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS yearbook_design_bindings_active_yearbook_idx
ON public.yearbook_design_bindings (yearbook_id) WHERE is_active = true;

CREATE UNIQUE INDEX IF NOT EXISTS yearbook_design_bindings_active_design_idx
ON public.yearbook_design_bindings (external_design_id) WHERE is_active = true;

CREATE OR REPLACE FUNCTION public.validate_positive_unique_int_array(arr INT[])
RETURNS BOOLEAN AS $$
DECLARE
  elem INT;
  seen INT[] := '{}';
BEGIN
  IF arr IS NULL OR cardinality(arr) = 0 THEN
    RETURN FALSE;
  END IF;

  FOREACH elem IN ARRAY arr LOOP
    IF elem IS NULL OR elem <= 0 THEN
      RETURN FALSE;
    END IF;
    IF elem = ANY(seen) THEN
      RETURN FALSE;
    END IF;
    seen := array_append(seen, elem);
  END LOOP;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE TABLE IF NOT EXISTS public.yearbook_design_page_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
  binding_id UUID NOT NULL,
  milestone_page_id UUID NOT NULL,
  external_page_numbers INT[] NOT NULL,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT yearbook_design_page_mappings_unique_page UNIQUE (binding_id, milestone_page_id),
  CONSTRAINT fk_binding_composite FOREIGN KEY (binding_id, yearbook_id) REFERENCES public.yearbook_design_bindings(id, yearbook_id) ON DELETE CASCADE,
  CONSTRAINT fk_page_composite FOREIGN KEY (milestone_page_id, yearbook_id) REFERENCES public.pages(id, yearbook_id) ON DELETE CASCADE,
  CONSTRAINT check_external_page_numbers_valid CHECK (public.validate_positive_unique_int_array(external_page_numbers))
);

CREATE TABLE IF NOT EXISTS public.proof_generation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key TEXT NOT NULL,
  requested_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  provider_connection_id UUID REFERENCES public.design_provider_connections(id) ON DELETE RESTRICT,
  binding_id UUID REFERENCES public.yearbook_design_bindings(id) ON DELETE RESTRICT,
  yearbook_id UUID REFERENCES public.yearbooks(id) ON DELETE RESTRICT,
  milestone_page_id UUID REFERENCES public.pages(id) ON DELETE RESTRICT,
  mapped_layout_pages INT[] NOT NULL,
  provider_export_job_id TEXT,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  created_proof_id UUID REFERENCES public.proofs(id) ON DELETE SET NULL,
  drive_file_id TEXT,
  error_message TEXT,
  retry_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT proof_generation_jobs_scoped_idempotency UNIQUE (requested_by, yearbook_id, binding_id, milestone_page_id, idempotency_key),
  CONSTRAINT proof_generation_jobs_scoped_provider_job UNIQUE (provider_connection_id, provider_export_job_id),
  CONSTRAINT check_proof_jobs_mapped_pages_valid CHECK (public.validate_positive_unique_int_array(mapped_layout_pages))
);

CREATE TABLE IF NOT EXISTS public.design_provider_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_connection_id UUID NOT NULL REFERENCES public.design_provider_connections(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  external_asset_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider_connection_id, asset_id)
);

-- --------------------------------------------------
-- 11. PLATFORM OPERATING MODE (SINGLE / MULTI CENTER)
-- --------------------------------------------------
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.platform_settings (
  id TEXT PRIMARY KEY DEFAULT 'global' CHECK (id = 'global'),
  operating_mode TEXT NOT NULL DEFAULT 'multi_center' CHECK (operating_mode IN ('single_center', 'multi_center')),
  primary_center_id UUID REFERENCES public.schools(id) ON DELETE SET NULL,
  changed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_single_center_has_primary CHECK (
    operating_mode = 'multi_center' OR primary_center_id IS NOT NULL
  )
);

INSERT INTO public.platform_settings (id, operating_mode, primary_center_id)
VALUES ('global', 'multi_center', NULL)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.platform_settings_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  previous_operating_mode TEXT NOT NULL,
  new_operating_mode TEXT NOT NULL,
  previous_primary_center_id UUID,
  previous_primary_center_name TEXT,
  new_primary_center_id UUID,
  new_primary_center_name TEXT,
  changed_by UUID,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.block_platform_settings_history_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'platform_settings_history is append-only and immutable.';
END;
$$;

DROP TRIGGER IF EXISTS trg_block_history_mutation ON public.platform_settings_history;
CREATE TRIGGER trg_block_history_mutation
BEFORE UPDATE OR DELETE ON public.platform_settings_history
FOR EACH ROW EXECUTE FUNCTION public.block_platform_settings_history_mutation();

CREATE OR REPLACE FUNCTION public.check_primary_center_integrity()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (
      SELECT 1 FROM public.platform_settings
      WHERE id = 'global'
        AND operating_mode = 'single_center'
        AND primary_center_id = OLD.id
    ) THEN
      RAISE EXCEPTION 'Cannot delete active Primary Center "%" while Single-Center operating mode is enabled. Restore Multiple-Center mode or select a different Primary Center first.', OLD.name;
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF (OLD.is_active = true AND NEW.is_active = false) AND EXISTS (
      SELECT 1 FROM public.platform_settings
      WHERE id = 'global'
        AND operating_mode = 'single_center'
        AND primary_center_id = OLD.id
    ) THEN
      RAISE EXCEPTION 'Cannot deactivate active Primary Center "%" while Single-Center operating mode is enabled. Restore Multiple-Center mode or select a different Primary Center first.', OLD.name;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_primary_center_modification ON public.schools;
CREATE TRIGGER trg_prevent_primary_center_modification
BEFORE DELETE OR UPDATE OF is_active ON public.schools
FOR EACH ROW EXECUTE FUNCTION public.check_primary_center_integrity();

-- --------------------------------------------------
-- 12. PRODUCTION BLUEPRINTS & GOVERNANCE
-- --------------------------------------------------
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
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_section_categories_composite UNIQUE (id, yearbook_id)
);

ALTER TABLE public.section_categories ADD COLUMN IF NOT EXISTS description TEXT;

CREATE TABLE IF NOT EXISTS public.layout_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  default_span TEXT NOT NULL DEFAULT 'single_page' CHECK (default_span IN ('single_page', 'facing_spread_left', 'facing_spread_right', 'two_page_spread', 'cover', 'unnumbered')),
  slot_count INT,
  row_count INT,
  col_count INT,
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_layout_types_composite UNIQUE (id, yearbook_id)
);

ALTER TABLE public.layout_types ADD COLUMN IF NOT EXISTS slot_count INT;
ALTER TABLE public.layout_types ADD COLUMN IF NOT EXISTS row_count INT;
ALTER TABLE public.layout_types ADD COLUMN IF NOT EXISTS col_count INT;
ALTER TABLE public.layout_types ADD COLUMN IF NOT EXISTS description TEXT;

-- Update layout_types check constraint for spans
DO $$ BEGIN
  ALTER TABLE public.layout_types DROP CONSTRAINT IF EXISTS layout_types_default_span_check;
  ALTER TABLE public.layout_types ADD CONSTRAINT layout_types_default_span_check
    CHECK (default_span IN ('single_page', 'facing_spread_left', 'facing_spread_right', 'two_page_spread', 'cover', 'unnumbered'));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

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

-- Design Packet Snapshots (Immutable payload with SHA-256)
CREATE TABLE IF NOT EXISTS public.design_packet_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID NOT NULL REFERENCES public.pages(id) ON DELETE CASCADE,
  yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
  version INT NOT NULL DEFAULT 1,
  parent_snapshot_id UUID REFERENCES public.design_packet_snapshots(id),
  snapshot_sha256 TEXT NOT NULL,
  prepared_by UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  snapshot_payload JSONB NOT NULL,
  CONSTRAINT uq_design_packet_snapshot_version UNIQUE (page_id, version)
);

CREATE OR REPLACE FUNCTION public.fn_prevent_design_snapshot_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Design packet snapshots are strictly immutable and cannot be updated or deleted.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_design_snapshot_mutation ON public.design_packet_snapshots;
CREATE TRIGGER trg_prevent_design_snapshot_mutation
  BEFORE UPDATE OR DELETE ON public.design_packet_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_prevent_design_snapshot_mutation();

-- Append-Only Design Packet Reviews
CREATE TABLE IF NOT EXISTS public.design_packet_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID NOT NULL REFERENCES public.design_packet_snapshots(id) ON DELETE CASCADE,
  page_id UUID NOT NULL REFERENCES public.pages(id) ON DELETE CASCADE,
  yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
  stage TEXT NOT NULL CHECK (stage IN ('eic_review', 'coordinator_approval', 'super_admin_check')),
  reviewer_user_id UUID NOT NULL REFERENCES public.users(id),
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'changes_requested', 'rejected')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.fn_prevent_design_review_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Design packet review decisions are append-only and cannot be updated or deleted.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_design_review_mutation ON public.design_packet_reviews;
CREATE TRIGGER trg_prevent_design_review_mutation
  BEFORE UPDATE OR DELETE ON public.design_packet_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_prevent_design_review_mutation();

-- Auditable Design Packet Asset Transfers (Canva / Provider)
CREATE TABLE IF NOT EXISTS public.design_packet_asset_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  design_packet_id UUID NOT NULL REFERENCES public.design_packet_snapshots(id) ON DELETE CASCADE,
  page_id UUID NOT NULL REFERENCES public.pages(id) ON DELETE CASCADE,
  yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
  asset_requirement_id UUID NOT NULL REFERENCES public.page_asset_requirements(id) ON DELETE CASCADE,
  source_asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL DEFAULT 'canva',
  provider_upload_job_id TEXT,
  provider_asset_id TEXT,
  transfer_status TEXT NOT NULL DEFAULT 'pending' CHECK (transfer_status IN ('pending', 'uploading', 'processing', 'available', 'failed', 'cancelled')),
  attempt_count INT NOT NULL DEFAULT 0,
  idempotency_key TEXT UNIQUE NOT NULL,
  error_summary TEXT,
  uploaded_by UUID NOT NULL REFERENCES public.users(id),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Canonical Proof Storage Objects (Google Drive Proof Vault)
CREATE TABLE IF NOT EXISTS public.proof_storage_objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proof_id UUID UNIQUE NOT NULL REFERENCES public.proofs(id) ON DELETE CASCADE,
  yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
  center_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  storage_connection_id UUID REFERENCES public.center_storage_connections(id) ON DELETE SET NULL,
  provider TEXT NOT NULL DEFAULT 'google_drive',
  provider_file_id TEXT NOT NULL,
  provider_folder_id TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'application/pdf',
  file_size_bytes BIGINT NOT NULL,
  page_count INT NOT NULL,
  checksum_sha256 TEXT NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES public.users(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Proof Access Requests (Coordinator Request -> Super Admin Approval Queue)
CREATE TABLE IF NOT EXISTS public.proof_access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proof_id UUID NOT NULL REFERENCES public.proofs(id) ON DELETE CASCADE,
  yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
  requested_by_user_id UUID NOT NULL REFERENCES public.users(id),
  target_user_id UUID NOT NULL REFERENCES public.users(id),
  scope TEXT NOT NULL CHECK (scope IN ('page', 'section', 'edition')),
  target_page_id UUID REFERENCES public.pages(id),
  target_section_id UUID REFERENCES public.sections(id),
  reason TEXT NOT NULL,
  due_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by_user_id UUID REFERENCES public.users(id),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Production Print Specifications (Confirmed vs Unconfirmed)
CREATE TABLE IF NOT EXISTS public.production_print_specifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  yearbook_id UUID UNIQUE NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'unconfirmed' CHECK (status IN ('unconfirmed', 'confirmed', 'verified')),
  trim_width NUMERIC(6,2),
  trim_height NUMERIC(6,2),
  dimension_unit TEXT NOT NULL DEFAULT 'in' CHECK (dimension_unit IN ('in', 'mm')),
  bleed_size NUMERIC(5,3) NOT NULL DEFAULT 0.125,
  color_profile TEXT NOT NULL DEFAULT 'CMYK Fogra39 / GRACoL',
  paper_stock_interior TEXT NOT NULL DEFAULT '100# Gloss Text',
  paper_stock_cover TEXT NOT NULL DEFAULT '120# Matte Cover',
  binding_type TEXT NOT NULL DEFAULT 'Smyth Sewn Hardcover',
  cover_finish TEXT NOT NULL DEFAULT 'Matte Lamination + Spot UV',
  print_quantity INT NOT NULL DEFAULT 500,
  service_bureau_name TEXT,
  service_bureau_notes TEXT,
  confirmed_by UUID REFERENCES public.users(id),
  confirmed_at TIMESTAMPTZ,
  verified_by UUID REFERENCES public.users(id),
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Service Bureau Release Packages (ZIP Release Archive Record)
CREATE TABLE IF NOT EXISTS public.service_bureau_release_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
  proof_id UUID NOT NULL REFERENCES public.proofs(id) ON DELETE RESTRICT,
  package_filename TEXT NOT NULL,
  package_sha256 TEXT NOT NULL,
  package_size_bytes BIGINT NOT NULL,
  storage_path TEXT NOT NULL,
  specifications_snapshot JSONB NOT NULL,
  approvals_snapshot JSONB NOT NULL,
  released_by_super_admin_id UUID NOT NULL REFERENCES public.users(id),
  released_at TIMESTAMPTZ NOT NULL DEFAULT now()
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


-- --------------------------------------------------
-- 13. PRODUCTION TRIGGERS & SIGNOFFS
-- --------------------------------------------------
-- Migration: 20260824000001_production_triggers_and_signoffs.sql
-- Purpose: Corrective trigger updates, append-only signoff enforcement, and unconfirmed spec field nullability

-- 1. Allow unconfirmed production print specifications to have NULL specification fields
ALTER TABLE public.production_print_specifications ALTER COLUMN bleed_size DROP NOT NULL;
ALTER TABLE public.production_print_specifications ALTER COLUMN print_quantity DROP NOT NULL;
ALTER TABLE public.production_print_specifications ALTER COLUMN color_profile DROP NOT NULL;
ALTER TABLE public.production_print_specifications ALTER COLUMN paper_stock_interior DROP NOT NULL;
ALTER TABLE public.production_print_specifications ALTER COLUMN paper_stock_cover DROP NOT NULL;
ALTER TABLE public.production_print_specifications ALTER COLUMN binding_type DROP NOT NULL;
ALTER TABLE public.production_print_specifications ALTER COLUMN cover_finish DROP NOT NULL;

-- 2. Catalog active columns
ALTER TABLE public.section_categories ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.layout_types ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- 3. Trigger: Prevent child record mutation on locked proofs
CREATE OR REPLACE FUNCTION public.fn_prevent_locked_child_mutation()
RETURNS TRIGGER AS $$
DECLARE
  v_proof_status public.proof_version_status;
BEGIN
  SELECT proof_version_status INTO v_proof_status
  FROM public.proofs
  WHERE id = NEW.proof_id;

  IF v_proof_status IS NOT NULL AND v_proof_status IN ('locked', 'final_candidate', 'institutionally_approved', 'released_for_production', 'superseded') THEN
    RAISE EXCEPTION 'Cannot insert or update child records for locked, finalized, or superseded proof version % (status: %)', NEW.proof_id, v_proof_status;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_locked_proof_pages_mutation ON public.proof_pages;
CREATE TRIGGER trg_prevent_locked_proof_pages_mutation
  BEFORE INSERT OR UPDATE ON public.proof_pages
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_prevent_locked_child_mutation();

DROP TRIGGER IF EXISTS trg_prevent_locked_corrections_mutation ON public.corrections;
DROP TRIGGER IF EXISTS trg_prevent_locked_correction_mutation ON public.corrections;
CREATE TRIGGER trg_prevent_locked_corrections_mutation
  BEFORE INSERT OR UPDATE ON public.corrections
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_prevent_locked_child_mutation();

DROP TRIGGER IF EXISTS trg_prevent_locked_corr_attach_mutation ON public.correction_attachments;
DROP TRIGGER IF EXISTS trg_prevent_locked_attachment_mutation ON public.correction_attachments;
CREATE TRIGGER trg_prevent_locked_corr_attach_mutation
  BEFORE INSERT OR UPDATE ON public.correction_attachments
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_prevent_locked_child_mutation();

DROP TRIGGER IF EXISTS trg_prevent_locked_corr_links_mutation ON public.correction_reference_links;
DROP TRIGGER IF EXISTS trg_prevent_locked_reference_links_mutation ON public.correction_reference_links;
CREATE TRIGGER trg_prevent_locked_corr_links_mutation
  BEFORE INSERT OR UPDATE ON public.correction_reference_links
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_prevent_locked_child_mutation();

-- 4. Trigger: Signoff Requirements Immutability on locked proofs
CREATE OR REPLACE FUNCTION public.fn_prevent_locked_signoff_req_mutation()
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

  IF v_proof_status IS NOT NULL AND v_proof_status IN ('locked', 'institutionally_approved', 'released_for_production', 'superseded') THEN
    RAISE EXCEPTION 'Cannot modify signoff requirements for locked, approved, or superseded proof version % (status: %)', v_proof_id, v_proof_status;
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
  EXECUTE FUNCTION public.fn_prevent_locked_signoff_req_mutation();

-- 5. Trigger: Signoff Decisions Append-Only Enforcement (STRICTLY BLOCK UPDATE and DELETE)
CREATE OR REPLACE FUNCTION public.fn_enforce_signoff_decision_append_only()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    RAISE EXCEPTION 'Proof signoff decisions are strictly append-only and cannot be updated or deleted.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_locked_signoff_dec_mutation ON public.proof_signoff_decisions;
DROP TRIGGER IF EXISTS trg_enforce_signoff_decision_append_only ON public.proof_signoff_decisions;
CREATE TRIGGER trg_enforce_signoff_decision_append_only
  BEFORE UPDATE OR DELETE ON public.proof_signoff_decisions
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_enforce_signoff_decision_append_only();


-- --------------------------------------------------
-- 14. WHOLE-YEARBOOK READINESS MANIFESTS & DRIFT
-- --------------------------------------------------
-- Migration: 20260824000002_readiness_manifest_and_drift.sql
-- Purpose: Whole-Yearbook Readiness Manifest, Canva folder bindings, page mapping drift tracking, and draft previews isolation

-- 1. Edition Readiness Manifests
CREATE TABLE IF NOT EXISTS public.edition_readiness_manifests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
  version INT NOT NULL DEFAULT 1,
  manifest_sha256 TEXT NOT NULL,
  expected_page_count INT NOT NULL,
  approved_pages_count INT NOT NULL,
  snapshots_manifest JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded')),
  approved_by UUID NOT NULL REFERENCES public.users(id),
  approved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  superseded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_edition_readiness_manifests_yb_active
  ON public.edition_readiness_manifests (yearbook_id) WHERE status = 'active';

-- 2. Add Canva Folder details to design bindings
ALTER TABLE public.yearbook_design_bindings ADD COLUMN IF NOT EXISTS external_folder_id TEXT;
ALTER TABLE public.yearbook_design_bindings ADD COLUMN IF NOT EXISTS external_folder_name TEXT;

-- 3. Add Drift Tracking and External Page ID to page mappings
ALTER TABLE public.yearbook_design_page_mappings ADD COLUMN IF NOT EXISTS external_page_id TEXT;
ALTER TABLE public.yearbook_design_page_mappings ADD COLUMN IF NOT EXISTS expected_page_number INT;
ALTER TABLE public.yearbook_design_page_mappings ADD COLUMN IF NOT EXISTS drift_status TEXT NOT NULL DEFAULT 'aligned';

-- 4. Isolated Page Draft Previews (Prevents single-page renders from polluting official proof rounds)
CREATE TABLE IF NOT EXISTS public.page_draft_previews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
  page_id UUID NOT NULL REFERENCES public.pages(id) ON DELETE CASCADE,
  external_design_id TEXT NOT NULL,
  external_page_numbers INT[] NOT NULL,
  pdf_storage_path TEXT NOT NULL,
  checksum_sha256 TEXT NOT NULL,
  generated_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- --------------------------------------------------
-- 15. CANVA IMPLEMENTATION TASKS
-- --------------------------------------------------
-- Migration: 20260824000003_canva_implementation_tasks.sql
-- Description: Creates decoupled Canva Implementation Tasks table and append-only event audit log with composite FKs.

-- 1. Ensure composite unique constraint on corrections
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_corrections_composite'
  ) THEN
    ALTER TABLE public.corrections ADD CONSTRAINT uq_corrections_composite UNIQUE (id, proof_id, yearbook_id);
  END IF;
END $$;

-- 2. Create canva_implementation_tasks table
CREATE TABLE IF NOT EXISTS public.canva_implementation_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  yearbook_id uuid NOT NULL,
  proof_id uuid NOT NULL,
  correction_id uuid NOT NULL,
  page_id uuid,
  page_number integer,
  task_status text NOT NULL DEFAULT 'approved_pending_application'
    CHECK (task_status IN ('approved_pending_application', 'in_progress', 'applied_in_canva', 'rejected', 'verified')),
  assigned_designer_id uuid REFERENCES public.users(id),
  designer_notes text,
  canva_element_id text,
  canva_page_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz,
  verified_at timestamptz,

  -- Enforce same-yearbook composite foreign keys
  CONSTRAINT fk_canva_task_proof_composite FOREIGN KEY (proof_id, yearbook_id)
    REFERENCES public.proofs(id, yearbook_id) ON DELETE CASCADE,
  CONSTRAINT fk_canva_task_correction_composite FOREIGN KEY (correction_id, proof_id, yearbook_id)
    REFERENCES public.corrections(id, proof_id, yearbook_id) ON DELETE CASCADE,
  CONSTRAINT fk_canva_task_page_composite FOREIGN KEY (page_id, yearbook_id)
    REFERENCES public.pages(id, yearbook_id) ON DELETE SET NULL,

  -- Prevent duplicate tasks per source correction
  CONSTRAINT uq_canva_task_correction UNIQUE (correction_id)
);

-- 3. Create append-only task events table for audit trail
CREATE TABLE IF NOT EXISTS public.canva_implementation_task_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.canva_implementation_tasks(id) ON DELETE CASCADE,
  yearbook_id uuid NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES public.users(id),
  event_type text NOT NULL CHECK (event_type IN ('created', 'status_change', 'notes_updated', 'applied', 'verified', 'rejected')),
  previous_status text,
  new_status text,
  notes text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_canva_tasks_yearbook ON public.canva_implementation_tasks(yearbook_id);
CREATE INDEX IF NOT EXISTS idx_canva_tasks_proof ON public.canva_implementation_tasks(proof_id);
CREATE INDEX IF NOT EXISTS idx_canva_tasks_status ON public.canva_implementation_tasks(task_status);
CREATE INDEX IF NOT EXISTS idx_canva_task_events_task ON public.canva_implementation_task_events(task_id);
