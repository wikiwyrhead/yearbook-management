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
