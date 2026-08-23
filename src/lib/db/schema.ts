export const SCHEMA_SQL = `
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. ENUMS
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

-- 2. AUTH & USER TABLES
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

-- 3. HELPER FUNCTIONS
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

-- 4. DOMAIN ENTITIES: SCHOOLS & YEARBOOKS
CREATE TABLE IF NOT EXISTS public.schools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  short_name TEXT,
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

CREATE OR REPLACE VIEW public.centers AS SELECT * FROM public.schools;

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

CREATE TABLE IF NOT EXISTS public.yearbook_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role public.yearbook_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (yearbook_id, user_id, role)
);

-- 5. LADDERS, SECTIONS, PAGES, ROSTER
CREATE TABLE IF NOT EXISTS public.sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#64748b',
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_sections_composite UNIQUE (id, yearbook_id)
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
  canva_design_id TEXT,
  canva_design_url TEXT,
  canva_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_pages_composite UNIQUE (id, yearbook_id)
);

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

-- 6. ASSETS & STORAGE
CREATE TABLE IF NOT EXISTS public.assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
  title TEXT,
  description TEXT,
  file_path TEXT NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  mime_type TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  asset_type public.asset_type NOT NULL DEFAULT 'photo',
  status public.asset_status NOT NULL DEFAULT 'raw',
  visibility public.asset_visibility NOT NULL DEFAULT 'private',
  tags TEXT[] DEFAULT '{}',
  is_current BOOLEAN NOT NULL DEFAULT true,
  uploaded_by UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.page_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID NOT NULL REFERENCES public.pages(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (page_id, asset_id)
);

CREATE TABLE IF NOT EXISTS public.asset_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  performed_by UUID NOT NULL REFERENCES public.users(id),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.upload_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  invited_by UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. PROOFING & PRODUCTION
CREATE TABLE IF NOT EXISTS public.proofs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  proof_type public.proof_type NOT NULL DEFAULT 'full',
  pdf_storage_path TEXT NOT NULL,
  status public.proof_status NOT NULL DEFAULT 'ready',
  page_count INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_by UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
  proof_id UUID REFERENCES public.proofs(id) ON DELETE SET NULL,
  page_id UUID REFERENCES public.pages(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  coordinates JSONB NOT NULL DEFAULT '{"x":50,"y":50}'::jsonb,
  severity public.correction_severity NOT NULL DEFAULT 'medium',
  status public.correction_status NOT NULL DEFAULT 'open',
  created_by UUID NOT NULL REFERENCES public.users(id),
  assigned_to UUID REFERENCES public.users(id),
  resolved_by UUID REFERENCES public.users(id),
  verified_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.page_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
  page_id UUID NOT NULL REFERENCES public.pages(id) ON DELETE CASCADE,
  approved_by UUID NOT NULL REFERENCES public.users(id),
  approved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  is_current BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (yearbook_id, page_id)
);

CREATE TABLE IF NOT EXISTS public.yearbook_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
  approved_by UUID NOT NULL REFERENCES public.users(id),
  approved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'approved',
  notes TEXT
);

CREATE TABLE IF NOT EXISTS public.proofreader_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
  page_id UUID REFERENCES public.pages(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL,
  is_checked BOOLEAN NOT NULL DEFAULT false,
  checked_by UUID REFERENCES public.users(id),
  checked_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.yearbook_lock_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  reason TEXT,
  user_id UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.preflight_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'PASS',
  blocking_issues JSONB DEFAULT '[]'::jsonb,
  warnings JSONB DEFAULT '[]'::jsonb,
  results JSONB DEFAULT '{}'::jsonb,
  run_by UUID NOT NULL REFERENCES public.users(id),
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

CREATE TABLE IF NOT EXISTS public.service_bureau_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES public.production_packages(id) ON DELETE CASCADE,
  bureau_name TEXT NOT NULL,
  bureau_order_id TEXT,
  status TEXT NOT NULL DEFAULT 'submitted',
  tracking_url TEXT,
  submitted_by UUID REFERENCES public.users(id),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
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

-- 8. EXTERNAL PROVIDERS SETTINGS & CONNECTIONS
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

CREATE TABLE IF NOT EXISTS public.yearbook_storage_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE UNIQUE,
  mode TEXT NOT NULL DEFAULT 'inherit_organization',
  provider TEXT,
  folder_id TEXT,
  folder_path TEXT,
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
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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

CREATE OR REPLACE FUNCTION public.validate_positive_unique_int_array(arr INT[])
RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  elem INT;
  seen_count INT;
BEGIN
  IF arr IS NULL OR array_length(arr, 1) IS NULL THEN
    RETURN FALSE;
  END IF;
  FOREACH elem IN ARRAY arr LOOP
    IF elem IS NULL OR elem <= 0 THEN
      RETURN FALSE;
    END IF;
  END LOOP;
  SELECT COUNT(DISTINCT x) INTO seen_count FROM unnest(arr) AS x;
  IF seen_count <> array_length(arr, 1) THEN
    RETURN FALSE;
  END IF;
  RETURN TRUE;
END;
$$;

CREATE TABLE IF NOT EXISTS public.yearbook_design_page_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
  binding_id UUID NOT NULL,
  milestone_page_id UUID NOT NULL,
  external_page_numbers INT[] NOT NULL,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT yearbook_design_page_mappings_unique_page UNIQUE (binding_id, milestone_page_id)
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
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.design_provider_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_connection_id UUID NOT NULL REFERENCES public.design_provider_connections(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  external_asset_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider_connection_id, asset_id)
);

-- 11. PLATFORM OPERATING MODE
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
`;

export interface DesignProviderConnection {
  id: string;
  provider: "canva" | "adobe_express";
  connected_by?: string | null;
  encrypted_credentials?: any;
  external_user_id?: string | null;
  external_team_id?: string | null;
  display_name?: string | null;
  scopes?: string[] | null;
  expires_at?: string | null;
  is_active: boolean;
  status: "connected" | "disconnected" | "needs_reauthorization" | "error";
  connected_at: string;
  disconnected_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface YearbookDesignBinding {
  id: string;
  yearbook_id: string;
  provider_connection_id: string;
  external_design_id: string;
  external_design_title: string;
  assigned_by?: string | null;
  assigned_at: string;
  is_active: boolean;
  replaced_at?: string | null;
  replaced_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface YearbookDesignPageMapping {
  id: string;
  yearbook_id: string;
  binding_id: string;
  milestone_page_id: string;
  external_page_numbers: number[];
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProofGenerationJob {
  id: string;
  idempotency_key: string;
  requested_by?: string | null;
  provider_connection_id: string;
  binding_id: string;
  yearbook_id: string;
  milestone_page_id: string;
  mapped_layout_pages: number[];
  provider_export_job_id?: string | null;
  status: "processing" | "completed" | "failed";
  created_proof_id?: string | null;
  drive_file_id?: string | null;
  error_message?: string | null;
  retry_count: number;
  created_at: string;
  updated_at: string;
}

export interface DesignProviderAsset {
  id: string;
  provider_connection_id: string;
  asset_id: string;
  external_asset_id: string;
  created_at: string;
}

export type PlatformOperatingMode = "single_center" | "multi_center";

export interface PlatformSettings {
  id: "global";
  operating_mode: PlatformOperatingMode;
  primary_center_id?: string | null;
  changed_by?: string | null;
  changed_at: string;
}

export interface PlatformSettingsHistory {
  id: string;
  previous_operating_mode: string;
  new_operating_mode: string;
  previous_primary_center_id?: string | null;
  previous_primary_center_name?: string | null;
  new_primary_center_id?: string | null;
  new_primary_center_name?: string | null;
  changed_by?: string | null;
  changed_at: string;
}

export interface SectionCategory {
  id: string;
  yearbook_id: string;
  name: string;
  code: string;
  color: string;
  sort_order: number;
  description?: string | null;
  created_at: string;
}

export interface LayoutType {
  id: string;
  yearbook_id: string;
  name: string;
  code: string;
  default_span: "single_page" | "facing_spread_left" | "facing_spread_right" | "two_page_spread" | "cover" | "unnumbered";
  slot_count?: number | null;
  row_count?: number | null;
  col_count?: number | null;
  description?: string | null;
  sort_order: number;
  created_at: string;
}

export interface DesignPacketSnapshot {
  id: string;
  page_id: string;
  yearbook_id: string;
  version: number;
  parent_snapshot_id?: string | null;
  snapshot_sha256: string;
  prepared_by: string;
  created_at: string;
  snapshot_payload: any;
}

export interface DesignPacketReview {
  id: string;
  snapshot_id: string;
  page_id: string;
  yearbook_id: string;
  stage: "eic_review" | "coordinator_approval" | "super_admin_check";
  reviewer_user_id: string;
  decision: "approved" | "changes_requested" | "rejected";
  notes?: string | null;
  created_at: string;
}

export interface DesignPacketAssetTransfer {
  id: string;
  design_packet_id: string;
  page_id: string;
  yearbook_id: string;
  asset_requirement_id: string;
  source_asset_id: string;
  provider: string;
  provider_upload_job_id?: string | null;
  provider_asset_id?: string | null;
  transfer_status: "pending" | "uploading" | "processing" | "available" | "failed" | "cancelled";
  attempt_count: number;
  idempotency_key: string;
  error_summary?: string | null;
  uploaded_by: string;
  started_at?: string | null;
  completed_at?: string | null;
  created_at: string;
}

export interface ProofStorageObject {
  id: string;
  proof_id: string;
  yearbook_id: string;
  center_id: string;
  storage_connection_id?: string | null;
  provider: string;
  provider_file_id: string;
  provider_folder_id: string;
  original_filename: string;
  mime_type: string;
  file_size_bytes: number;
  page_count: number;
  checksum_sha256: string;
  uploaded_by: string;
  uploaded_at: string;
  verified_at: string;
}

export interface ProofAccessRequest {
  id: string;
  proof_id: string;
  yearbook_id: string;
  requested_by_user_id: string;
  target_user_id: string;
  scope: "page" | "section" | "edition";
  target_page_id?: string | null;
  target_section_id?: string | null;
  reason: string;
  due_at?: string | null;
  status: "pending" | "approved" | "rejected";
  reviewed_by_user_id?: string | null;
  reviewed_at?: string | null;
  review_notes?: string | null;
  created_at: string;
}

export interface ProductionPrintSpecification {
  id: string;
  yearbook_id: string;
  status: "unconfirmed" | "confirmed" | "verified";
  trim_width?: number | null;
  trim_height?: number | null;
  dimension_unit: "in" | "mm";
  bleed_size: number;
  color_profile: string;
  paper_stock_interior: string;
  paper_stock_cover: string;
  binding_type: string;
  cover_finish: string;
  print_quantity: number;
  service_bureau_name?: string | null;
  service_bureau_notes?: string | null;
  confirmed_by?: string | null;
  confirmed_at?: string | null;
  verified_by?: string | null;
  verified_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ServiceBureauReleasePackage {
  id: string;
  yearbook_id: string;
  proof_id: string;
  package_filename: string;
  package_sha256: string;
  package_size_bytes: number;
  storage_path: string;
  specifications_snapshot: any;
  approvals_snapshot: any;
  released_by_super_admin_id: string;
  released_at: string;
}

