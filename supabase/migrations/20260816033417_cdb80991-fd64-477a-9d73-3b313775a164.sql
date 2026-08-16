CREATE TYPE public.asset_type AS ENUM ('photo', 'document', 'pdf', 'logo', 'artwork', 'message', 'other');
CREATE TYPE public.asset_status AS ENUM ('missing', 'requested', 'uploaded', 'under_review', 'approved', 'rejected', 'replacement_required', 'archived');
CREATE TYPE public.storage_provider AS ENUM ('lovable', 'google_drive', 'onedrive', 'dropbox', 'external');

CREATE TABLE public.assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
    asset_type public.asset_type NOT NULL DEFAULT 'photo',
    category TEXT,
    student_id UUID REFERENCES public.students(id) ON DELETE SET NULL,
    faculty_id UUID REFERENCES public.faculty(id) ON DELETE SET NULL,
    class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
    section_id UUID REFERENCES public.sections(id) ON DELETE SET NULL,
    file_name TEXT NOT NULL,
    file_type TEXT,
    file_size BIGINT,
    storage_provider public.storage_provider NOT NULL DEFAULT 'lovable',
    storage_path TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    is_current BOOLEAN NOT NULL DEFAULT TRUE,
    status public.asset_status NOT NULL DEFAULT 'uploaded',
    validation_metadata JSONB DEFAULT '{}'::jsonb,
    notes TEXT,
    uploaded_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.assets TO authenticated;
GRANT ALL ON public.assets TO service_role;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.page_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    page_id UUID NOT NULL REFERENCES public.pages(id) ON DELETE CASCADE,
    asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
    requirement_id UUID REFERENCES public.page_requirements(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(page_id, asset_id)
);

GRANT SELECT, INSERT, DELETE ON public.page_assets TO authenticated;
GRANT ALL ON public.page_assets TO service_role;
ALTER TABLE public.page_assets ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.asset_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
    yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    performed_by UUID NOT NULL REFERENCES auth.users(id),
    old_status public.asset_status,
    new_status public.asset_status,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.asset_audit_log TO authenticated;
GRANT ALL ON public.asset_audit_log TO service_role;
ALTER TABLE public.asset_audit_log ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.yearbook_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role public.yearbook_role NOT NULL DEFAULT 'student',
    invited_by UUID NOT NULL REFERENCES auth.users(id),
    status TEXT NOT NULL DEFAULT 'pending',
    token UUID NOT NULL DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
    UNIQUE(yearbook_id, email)
);

GRANT SELECT, INSERT, UPDATE ON public.yearbook_invitations TO authenticated;
GRANT ALL ON public.yearbook_invitations TO service_role;
ALTER TABLE public.yearbook_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view assets of their yearbooks"
ON public.assets FOR SELECT TO authenticated
USING (
    public.is_super_admin(auth.uid()) OR 
    public.is_yearbook_member(auth.uid(), yearbook_id)
);

CREATE POLICY "Users can insert assets into their yearbooks"
ON public.assets FOR INSERT TO authenticated
WITH CHECK (
    public.is_super_admin(auth.uid()) OR 
    public.can_edit_yearbook(auth.uid(), yearbook_id)
);

CREATE POLICY "Users can update assets in their yearbooks"
ON public.assets FOR UPDATE TO authenticated
USING (
    public.is_super_admin(auth.uid()) OR 
    public.can_edit_yearbook(auth.uid(), yearbook_id)
);

CREATE POLICY "Users can manage page assets of their yearbooks"
ON public.page_assets FOR ALL TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.pages p
        WHERE p.id = page_id
        AND (public.is_super_admin(auth.uid()) OR public.can_edit_yearbook(auth.uid(), p.yearbook_id))
    )
);

CREATE POLICY "Coordinators can manage invitations"
ON public.yearbook_invitations FOR ALL TO authenticated
USING (
    public.is_super_admin(auth.uid()) OR 
    public.can_manage_yearbook(auth.uid(), yearbook_id)
);
