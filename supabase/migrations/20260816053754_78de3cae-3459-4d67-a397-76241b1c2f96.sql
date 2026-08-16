-- Phase 6: External Storage Providers
ALTER TYPE public.storage_provider ADD VALUE IF NOT EXISTS 'box';

CREATE TYPE public.provider_connection_status AS ENUM ('connected','needs_reauthorization','disconnected','error');
CREATE TYPE public.yearbook_storage_mode AS ENUM ('inherit_organization','provider','milestone');

-- Asset external source metadata (extends existing assets table; storage_provider already exists)
ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS external_file_id TEXT,
  ADD COLUMN IF NOT EXISTS external_folder_id TEXT,
  ADD COLUMN IF NOT EXISTS external_url TEXT,
  ADD COLUMN IF NOT EXISTS external_filename TEXT,
  ADD COLUMN IF NOT EXISTS source_metadata JSONB,
  ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_assets_provider ON public.assets(storage_provider);
CREATE INDEX IF NOT EXISTS idx_assets_external_file ON public.assets(external_file_id) WHERE external_file_id IS NOT NULL;

-- Level 1: organization-level provider connections (Super Admin only)
CREATE TABLE public.organization_storage_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider public.storage_provider NOT NULL,
  display_name TEXT,
  status public.provider_connection_status NOT NULL DEFAULT 'disconnected',
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  root_folder_id TEXT,
  root_folder_path TEXT,
  account_email TEXT,
  external_account_id TEXT,
  credentials JSONB,
  last_error TEXT,
  last_checked_at TIMESTAMPTZ,
  connected_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_storage_connections TO authenticated;
GRANT ALL ON public.organization_storage_connections TO service_role;
ALTER TABLE public.organization_storage_connections ENABLE ROW LEVEL SECURITY;

-- Credentials column is never selected by client code; server fns use service role.
CREATE POLICY "Super admins manage organization storage"
ON public.organization_storage_connections FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TRIGGER trg_org_storage_updated BEFORE UPDATE ON public.organization_storage_connections
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Level 2: yearbook storage configuration
CREATE TABLE public.yearbook_storage_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  yearbook_id UUID NOT NULL UNIQUE REFERENCES public.yearbooks(id) ON DELETE CASCADE,
  mode public.yearbook_storage_mode NOT NULL DEFAULT 'milestone',
  provider public.storage_provider,
  folder_id TEXT,
  folder_path TEXT,
  allow_member_sources BOOLEAN NOT NULL DEFAULT TRUE,
  additional_providers public.storage_provider[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.yearbook_storage_config TO authenticated;
GRANT ALL ON public.yearbook_storage_config TO service_role;
ALTER TABLE public.yearbook_storage_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view yearbook storage config"
ON public.yearbook_storage_config FOR SELECT TO authenticated
USING (public.is_yearbook_member(auth.uid(), yearbook_id));

CREATE POLICY "Coordinators manage yearbook storage config"
ON public.yearbook_storage_config FOR ALL TO authenticated
USING (public.can_manage_yearbook(auth.uid(), yearbook_id))
WITH CHECK (public.can_manage_yearbook(auth.uid(), yearbook_id));

CREATE TRIGGER trg_yearbook_storage_updated BEFORE UPDATE ON public.yearbook_storage_config
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Level 3: optional member personal import sources
CREATE TABLE public.member_storage_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider public.storage_provider NOT NULL,
  status public.provider_connection_status NOT NULL DEFAULT 'disconnected',
  account_email TEXT,
  external_account_id TEXT,
  credentials JSONB,
  last_error TEXT,
  last_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_storage_connections TO authenticated;
GRANT ALL ON public.member_storage_connections TO service_role;
ALTER TABLE public.member_storage_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members manage only their own storage connections"
ON public.member_storage_connections FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_member_storage_updated BEFORE UPDATE ON public.member_storage_connections
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Audit gap fixes found during Phase 6 audit: these tables had RLS disabled.
ALTER TABLE public.proofs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view proofs of their yearbooks"
ON public.proofs FOR SELECT TO authenticated
USING (public.is_yearbook_member(auth.uid(), yearbook_id));
CREATE POLICY "Staff create proofs"
ON public.proofs FOR INSERT TO authenticated
WITH CHECK (public.is_yearbook_staff_member(auth.uid(), yearbook_id) AND created_by = auth.uid());
CREATE POLICY "Coordinators update proofs"
ON public.proofs FOR UPDATE TO authenticated
USING (public.can_manage_yearbook(auth.uid(), yearbook_id))
WITH CHECK (public.can_manage_yearbook(auth.uid(), yearbook_id));

ALTER TABLE public.proof_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view proof pages of their yearbooks"
ON public.proof_pages FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.proofs p WHERE p.id = proof_id AND public.is_yearbook_member(auth.uid(), p.yearbook_id)));
CREATE POLICY "Staff link proof pages"
ON public.proof_pages FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.proofs p WHERE p.id = proof_id AND public.is_yearbook_staff_member(auth.uid(), p.yearbook_id)));

ALTER TABLE public.canva_integrations ENABLE ROW LEVEL SECURITY;
-- Tokens are server-only: no authenticated policy grants access to this table.
REVOKE ALL ON public.canva_integrations FROM authenticated, anon;
GRANT ALL ON public.canva_integrations TO service_role;