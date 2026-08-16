-- 1. Enums and Statuses
DO $$ BEGIN
    CREATE TYPE public.design_status AS ENUM ('waiting_for_assets', 'ready_for_design', 'designing', 'complete', 'needs_review', 'ready_for_proof');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.proof_status AS ENUM ('processing', 'ready', 'failed', 'archived');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Update Pages Table
ALTER TABLE public.pages 
ADD COLUMN IF NOT EXISTS design_status public.design_status NOT NULL DEFAULT 'waiting_for_assets',
ADD COLUMN IF NOT EXISTS design_readiness_override BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS canva_design_name TEXT;

-- 3. Canva Integrations Table (Yearbook Level)
CREATE TABLE IF NOT EXISTS public.canva_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
    team_id TEXT,
    folder_id TEXT,
    access_token_encrypted TEXT, -- Placeholder for future OAuth
    refresh_token_encrypted TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(yearbook_id)
);

-- 4. Proofs Table
CREATE TABLE IF NOT EXISTS public.proofs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    storage_path TEXT NOT NULL,
    canva_export_id TEXT,
    status public.proof_status NOT NULL DEFAULT 'ready',
    notes TEXT,
    created_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Proof Pages (Link Proofs to Pages)
CREATE TABLE IF NOT EXISTS public.proof_pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proof_id UUID NOT NULL REFERENCES public.proofs(id) ON DELETE CASCADE,
    page_id UUID NOT NULL REFERENCES public.pages(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(proof_id, page_id)
);

-- 6. RLS and Grants
ALTER TABLE public.canva_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proof_pages ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.canva_integrations TO authenticated;
GRANT ALL ON public.canva_integrations TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.proofs TO authenticated;
GRANT ALL ON public.proofs TO service_role;

GRANT SELECT, INSERT, DELETE ON public.proof_pages TO authenticated;
GRANT ALL ON public.proof_pages TO service_role;

-- Policies
CREATE POLICY "Users can manage canva integration for their yearbooks"
ON public.canva_integrations FOR ALL TO authenticated
USING (
    public.is_super_admin(auth.uid()) OR 
    public.can_manage_yearbook(auth.uid(), yearbook_id)
);

CREATE POLICY "Users can view proofs of their yearbooks"
ON public.proofs FOR SELECT TO authenticated
USING (
    public.is_super_admin(auth.uid()) OR 
    public.is_yearbook_member(auth.uid(), yearbook_id)
);

CREATE POLICY "Privileged users can manage proofs"
ON public.proofs FOR ALL TO authenticated
USING (
    public.is_super_admin(auth.uid()) OR 
    public.can_edit_yearbook(auth.uid(), yearbook_id)
);

CREATE POLICY "Users can view proof_pages"
ON public.proof_pages FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.proofs p
        WHERE p.id = proof_id
        AND (public.is_super_admin(auth.uid()) OR public.is_yearbook_member(auth.uid(), p.yearbook_id))
    )
);

CREATE POLICY "Privileged users can manage proof_pages"
ON public.proof_pages FOR ALL TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.proofs p
        WHERE p.id = proof_id
        AND (public.is_super_admin(auth.uid()) OR public.can_edit_yearbook(auth.uid(), p.yearbook_id))
    )
);

-- 7. Trigger: Asset Change Awareness
-- If an approved asset linked to a page changes, flag the page
CREATE OR REPLACE FUNCTION public.handle_asset_change_flag_page()
RETURNS TRIGGER AS $$
BEGIN
    -- If status changes from approved or file changes, flag related pages
    IF (OLD.status = 'approved' AND NEW.status != 'approved') OR (OLD.storage_path != NEW.storage_path) THEN
        UPDATE public.pages
        SET design_status = 'needs_review'
        WHERE id IN (
            SELECT page_id FROM public.page_assets WHERE asset_id = NEW.id
        )
        AND design_status IN ('complete', 'ready_for_proof');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER asset_change_flag_page_trigger
AFTER UPDATE ON public.assets
FOR EACH ROW
EXECUTE FUNCTION public.handle_asset_change_flag_page();

