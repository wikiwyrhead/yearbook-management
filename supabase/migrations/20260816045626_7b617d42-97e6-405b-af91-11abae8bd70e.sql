-- 1. Secure Assets Bucket
-- Path format: yearbooks/{yearbook_id}/assets/{file}
-- We drop existing policies if any to avoid duplicates
DROP POLICY IF EXISTS "Yearbook members can view assets" ON storage.objects;
DROP POLICY IF EXISTS "Privileged members can upload assets" ON storage.objects;
DROP POLICY IF EXISTS "Privileged members can delete assets" ON storage.objects;

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

-- 2. Secure Proofs Bucket
-- Path format: yearbooks/{yearbook_id}/proofs/{file}
DROP POLICY IF EXISTS "Yearbook members can view proofs" ON storage.objects;
DROP POLICY IF EXISTS "Coordinators can manage proofs" ON storage.objects;

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
