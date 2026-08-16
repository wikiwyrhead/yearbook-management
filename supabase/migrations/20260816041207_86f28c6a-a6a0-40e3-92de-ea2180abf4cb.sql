-- Phase 3 recovery (if needed) and Phase 4 implementation

-- Phase 3 core tables (ensure these exist)
CREATE TABLE IF NOT EXISTS public.canva_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
    team_id TEXT,
    folder_id TEXT,
    access_token_encrypted TEXT,
    refresh_token_encrypted TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(yearbook_id)
);

CREATE TABLE IF NOT EXISTS public.proofs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    storage_path TEXT NOT NULL,
    canva_export_id TEXT,
    status TEXT NOT NULL DEFAULT 'ready',
    notes TEXT,
    created_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.proof_pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proof_id UUID NOT NULL REFERENCES public.proofs(id) ON DELETE CASCADE,
    page_id UUID NOT NULL REFERENCES public.pages(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(proof_id, page_id)
);

-- Grants for Phase 3 tables
GRANT SELECT, INSERT, UPDATE, DELETE ON public.canva_integrations TO authenticated;
GRANT ALL ON public.canva_integrations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.proofs TO authenticated;
GRANT ALL ON public.proofs TO service_role;
GRANT SELECT, INSERT, DELETE ON public.proof_pages TO authenticated;
GRANT ALL ON public.proof_pages TO service_role;

-- Phase 4 Enums
DO $$ BEGIN
    CREATE TYPE public.correction_status AS ENUM (
        'open', 'acknowledged', 'in_progress', 'resolved', 
        'awaiting_verification', 'verified', 'closed', 
        'rejected', 'cancelled'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE public.annotation_type AS ENUM ('point', 'rectangle', 'highlight', 'comment');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE public.correction_category AS ENUM (
        'typographical', 'name', 'date', 'caption', 'image', 
        'missing_asset', 'wrong_asset', 'layout', 'alignment', 
        'content', 'requirement', 'other'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Phase 4 Tables
CREATE TABLE IF NOT EXISTS public.corrections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
    proof_id UUID NOT NULL REFERENCES public.proofs(id) ON DELETE CASCADE,
    page_id UUID NOT NULL REFERENCES public.pages(id) ON DELETE CASCADE,
    annotation_type public.annotation_type NOT NULL,
    coordinates JSONB NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    category public.correction_category NOT NULL DEFAULT 'other',
    priority TEXT DEFAULT 'medium',
    status public.correction_status NOT NULL DEFAULT 'open',
    created_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    assigned_to UUID REFERENCES auth.users(id),
    resolved_by UUID REFERENCES auth.users(id),
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT,
    verified_by UUID REFERENCES auth.users(id),
    verified_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.correction_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    correction_id UUID NOT NULL REFERENCES public.corrections(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.page_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    page_id UUID NOT NULL REFERENCES public.pages(id) ON DELETE CASCADE,
    proof_id UUID NOT NULL REFERENCES public.proofs(id) ON DELETE CASCADE,
    yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
    approved_by UUID NOT NULL REFERENCES auth.users(id),
    approved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(page_id, proof_id)
);

CREATE TABLE IF NOT EXISTS public.yearbook_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
    proof_id UUID NOT NULL REFERENCES public.proofs(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'approved',
    notes TEXT,
    reason TEXT,
    created_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.proofreader_checklists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
    page_type_id UUID REFERENCES public.page_types(id) ON DELETE CASCADE,
    item_text TEXT NOT NULL,
    category TEXT,
    position INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.page_checklist_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    page_id UUID NOT NULL REFERENCES public.pages(id) ON DELETE CASCADE,
    proof_id UUID NOT NULL REFERENCES public.proofs(id) ON DELETE CASCADE,
    checklist_id UUID NOT NULL REFERENCES public.proofreader_checklists(id) ON DELETE CASCADE,
    is_checked BOOLEAN NOT NULL DEFAULT false,
    updated_by UUID NOT NULL REFERENCES auth.users(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(page_id, proof_id, checklist_id)
);

CREATE TABLE IF NOT EXISTS public.production_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Phase 4 RLS
ALTER TABLE public.corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.correction_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.page_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yearbook_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proofreader_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.page_checklist_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_audit_log ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.corrections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.correction_comments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.page_approvals TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.yearbook_approvals TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.proofreader_checklists TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.page_checklist_responses TO authenticated;
GRANT SELECT, INSERT ON public.production_audit_log TO authenticated;

GRANT ALL ON public.corrections TO service_role;
GRANT ALL ON public.correction_comments TO service_role;
GRANT ALL ON public.page_approvals TO service_role;
GRANT ALL ON public.yearbook_approvals TO service_role;
GRANT ALL ON public.proofreader_checklists TO service_role;
GRANT ALL ON public.page_checklist_responses TO service_role;
GRANT ALL ON public.production_audit_log TO service_role;

-- Logic for Verification and Invalidation
CREATE POLICY "Yearbook members view corrections" ON public.corrections FOR SELECT TO authenticated USING (public.is_yearbook_member(auth.uid(), yearbook_id));
CREATE POLICY "Yearbook members create corrections" ON public.corrections FOR INSERT TO authenticated WITH CHECK (public.is_yearbook_member(auth.uid(), yearbook_id));
CREATE POLICY "Verification Rule: cannot verify own resolution" ON public.corrections FOR UPDATE TO authenticated
    USING (public.is_yearbook_member(auth.uid(), yearbook_id))
    WITH CHECK (
        (status = 'verified' AND (verified_by != resolved_by OR public.is_super_admin(auth.uid())))
        OR status != 'verified' OR status IS NULL
    );

CREATE OR REPLACE FUNCTION public.handle_correction_change()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT' AND NEW.status = 'open') OR 
       (TG_OP = 'UPDATE' AND OLD.status IN ('verified', 'closed') AND NEW.status NOT IN ('verified', 'closed')) THEN
        DELETE FROM public.page_approvals WHERE page_id = NEW.page_id AND proof_id = NEW.proof_id;
        UPDATE public.yearbook_approvals SET status = 'unlocked_revision', reason = 'Correction reopened'
        WHERE yearbook_id = NEW.yearbook_id AND proof_id = NEW.proof_id AND status = 'locked';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER correction_invalidation_trigger AFTER INSERT OR UPDATE ON public.corrections FOR EACH ROW EXECUTE FUNCTION public.handle_correction_change();

-- Isolations
CREATE POLICY "Yearbook members access comments" ON public.correction_comments FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.corrections c WHERE c.id = correction_id AND public.is_yearbook_member(auth.uid(), c.yearbook_id)));
CREATE POLICY "Yearbook members access page approvals" ON public.page_approvals FOR ALL TO authenticated USING (public.is_yearbook_member(auth.uid(), yearbook_id));
CREATE POLICY "Yearbook members access yearbook approvals" ON public.yearbook_approvals FOR ALL TO authenticated USING (public.is_yearbook_member(auth.uid(), yearbook_id));
CREATE POLICY "Yearbook members access checklists" ON public.proofreader_checklists FOR ALL TO authenticated USING (public.is_yearbook_member(auth.uid(), yearbook_id));
CREATE POLICY "Yearbook members access checklist responses" ON public.page_checklist_responses FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.pages p WHERE p.id = page_id AND public.is_yearbook_member(auth.uid(), p.yearbook_id)));
CREATE POLICY "Yearbook members view audit log" ON public.production_audit_log FOR SELECT TO authenticated USING (public.is_yearbook_member(auth.uid(), yearbook_id));
