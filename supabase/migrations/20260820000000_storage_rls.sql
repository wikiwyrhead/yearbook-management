-- Storage RLS Verification and Implementation
-- Ensures yearbook_assets and yearbook_proofs buckets exist and are secured.

-- 1. Create Buckets
INSERT INTO storage.buckets (id, name, public)
VALUES ('yearbook_assets', 'yearbook_assets', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('yearbook_proofs', 'yearbook_proofs', false)
ON CONFLICT (id) DO NOTHING;

-- 2. Enable RLS on storage.objects (it is enabled by default in Supabase, but let's be explicit)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 3. Clear existing broad policies for these buckets to avoid conflicts
-- Note: We use yearbook-level pathing: yearbooks/{yearbook_id}/assets/{filename}

-- ASSETS BUCKET POLICIES

CREATE POLICY "Yearbook members can view assets"
ON storage.objects FOR SELECT TO authenticated
USING (
    bucket_id = 'yearbook_assets' AND (
        public.is_super_admin(auth.uid()) OR
        public.is_yearbook_member(auth.uid(), (storage.foldername(name))[2]::uuid)
    )
);

CREATE POLICY "Privileged members can upload assets"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'yearbook_assets' AND (
        public.is_super_admin(auth.uid()) OR
        public.can_edit_yearbook(auth.uid(), (storage.foldername(name))[2]::uuid)
    )
);

CREATE POLICY "Privileged members can delete assets"
ON storage.objects FOR DELETE TO authenticated
USING (
    bucket_id = 'yearbook_assets' AND (
        public.is_super_admin(auth.uid()) OR
        public.can_edit_yearbook(auth.uid(), (storage.foldername(name))[2]::uuid)
    )
);

-- PROOFS BUCKET POLICIES

CREATE POLICY "Yearbook members can view proofs"
ON storage.objects FOR SELECT TO authenticated
USING (
    bucket_id = 'yearbook_proofs' AND (
        public.is_super_admin(auth.uid()) OR
        public.is_yearbook_member(auth.uid(), (storage.foldername(name))[2]::uuid)
    )
);

CREATE POLICY "Coordinators can manage proofs"
ON storage.objects FOR ALL TO authenticated
USING (
    bucket_id = 'yearbook_proofs' AND (
        public.is_super_admin(auth.uid()) OR
        public.can_manage_yearbook(auth.uid(), (storage.foldername(name))[2]::uuid)
    )
);

-- Note: storage.foldername(name) returns an array. 
-- Path expected: yearbooks/{yearbook_id}/assets/{file} -> [yearbooks, {id}, assets, {file}]
-- So [2] index is the yearbook_id.
