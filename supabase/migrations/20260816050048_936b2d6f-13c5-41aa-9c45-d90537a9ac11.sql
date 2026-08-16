-- Phase 5: Production & Service Bureau Workflow

-- 1. Service Bureau Directory
CREATE TABLE public.service_bureaus (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    contact_name text,
    email text,
    website text,
    submission_method text, -- 'manual', 'email', 'portal', 'api'
    file_requirements jsonb DEFAULT '{}'::jsonb,
    notes text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

GRANT SELECT ON public.service_bureaus TO authenticated;
GRANT ALL ON public.service_bureaus TO service_role;

ALTER TABLE public.service_bureaus ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view service bureaus"
ON public.service_bureaus FOR SELECT TO authenticated USING (true);

-- 2. Production Snapshots (Immutable)
CREATE TABLE public.production_snapshots (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    yearbook_id uuid REFERENCES public.yearbooks(id) ON DELETE CASCADE NOT NULL,
    version integer NOT NULL,
    snapshot_data jsonb NOT NULL, -- Capture page order, proof versions, asset versions, approvals
    created_by uuid REFERENCES auth.users(id) NOT NULL,
    created_at timestamptz DEFAULT now()
);

GRANT SELECT, INSERT ON public.production_snapshots TO authenticated;
GRANT ALL ON public.production_snapshots TO service_role;

ALTER TABLE public.production_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Yearbook members can view snapshots"
ON public.production_snapshots FOR SELECT TO authenticated
USING (public.is_yearbook_member(auth.uid(), yearbook_id));

CREATE POLICY "Coordinators can create snapshots"
ON public.production_snapshots FOR INSERT TO authenticated
WITH CHECK (public.can_manage_yearbook(auth.uid(), yearbook_id));

-- Prevent updates/deletes to ensure immutability
CREATE POLICY "Snapshots are immutable"
ON public.production_snapshots FOR ALL TO authenticated
USING (false) WITH CHECK (false);

-- 3. Preflight Reports
CREATE TABLE public.preflight_reports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    yearbook_id uuid REFERENCES public.yearbooks(id) ON DELETE CASCADE NOT NULL,
    snapshot_id uuid REFERENCES public.production_snapshots(id) ON DELETE SET NULL,
    results jsonb NOT NULL,
    blocking_issues text[],
    warnings text[],
    status text NOT NULL, -- 'PASS', 'BLOCKED'
    run_by uuid REFERENCES auth.users(id) NOT NULL,
    created_at timestamptz DEFAULT now()
);

GRANT SELECT, INSERT ON public.preflight_reports TO authenticated;
GRANT ALL ON public.preflight_reports TO service_role;

ALTER TABLE public.preflight_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Yearbook members can view reports"
ON public.preflight_reports FOR SELECT TO authenticated
USING (public.is_yearbook_member(auth.uid(), yearbook_id));

CREATE POLICY "Coordinators can run preflight"
ON public.preflight_reports FOR INSERT TO authenticated
WITH CHECK (public.can_manage_yearbook(auth.uid(), yearbook_id));

-- 4. Production Packages
CREATE TABLE public.production_packages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    yearbook_id uuid REFERENCES public.yearbooks(id) ON DELETE CASCADE NOT NULL,
    snapshot_id uuid REFERENCES public.production_snapshots(id) ON DELETE CASCADE NOT NULL,
    manifest jsonb NOT NULL,
    storage_path text NOT NULL,
    checksum_sha256 text NOT NULL,
    generated_by uuid REFERENCES auth.users(id) NOT NULL,
    created_at timestamptz DEFAULT now()
);

GRANT SELECT, INSERT ON public.production_packages TO authenticated;
GRANT ALL ON public.production_packages TO service_role;

ALTER TABLE public.production_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Yearbook members can view packages"
ON public.production_packages FOR SELECT TO authenticated
USING (public.is_yearbook_member(auth.uid(), yearbook_id));

CREATE POLICY "Coordinators can generate packages"
ON public.production_packages FOR INSERT TO authenticated
WITH CHECK (public.can_manage_yearbook(auth.uid(), yearbook_id));

-- 5. Service Bureau Submissions
CREATE TABLE public.service_bureau_submissions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    yearbook_id uuid REFERENCES public.yearbooks(id) ON DELETE CASCADE NOT NULL,
    snapshot_id uuid REFERENCES public.production_snapshots(id) ON DELETE CASCADE NOT NULL,
    package_id uuid REFERENCES public.production_packages(id) ON DELETE CASCADE NOT NULL,
    service_bureau_id uuid REFERENCES public.service_bureaus(id) ON DELETE SET NULL,
    status text NOT NULL DEFAULT 'READY', -- 'READY', 'SUBMITTED', 'RECEIVED', 'IN REVIEW', 'REVISION REQUESTED', 'RESUBMITTED', 'ACCEPTED', 'REJECTED', 'COMPLETED'
    external_reference text,
    notes text,
    submitted_by uuid REFERENCES auth.users(id),
    submitted_at timestamptz,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.service_bureau_submissions TO authenticated;
GRANT ALL ON public.service_bureau_submissions TO service_role;

ALTER TABLE public.service_bureau_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Yearbook members can view submissions"
ON public.service_bureau_submissions FOR SELECT TO authenticated
USING (public.is_yearbook_member(auth.uid(), yearbook_id));

CREATE POLICY "Coordinators can manage submissions"
ON public.service_bureau_submissions FOR ALL TO authenticated
USING (public.can_manage_yearbook(auth.uid(), yearbook_id));

-- 6. Storage Bucket for Production
-- (Creation handled via tool call, here we define policies)
CREATE POLICY "Yearbook members can view production files"
ON storage.objects FOR SELECT TO authenticated
USING (
    bucket_id = 'yearbook_production' AND (
        public.is_super_admin(auth.uid()) OR
        public.is_yearbook_member(auth.uid(), (storage.foldername(name))[2]::uuid)
    )
);

CREATE POLICY "Coordinators can upload production files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'yearbook_production' AND (
        public.is_super_admin(auth.uid()) OR
        public.can_manage_yearbook(auth.uid(), (storage.foldername(name))[2]::uuid)
    )
);

-- Seed some default Service Bureaus
INSERT INTO public.service_bureaus (name, submission_method, notes)
VALUES 
('Service Bureau A (Local)', 'manual', 'Standard local printing service'),
('Service Bureau B (Direct)', 'portal', 'Online portal for bulk orders')
ON CONFLICT DO NOTHING;
