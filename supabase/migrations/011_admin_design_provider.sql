-- Migration 011: Hidden Super-Admin Design Provider Architecture (Additive & Reversible)
-- Preserves legacy tables: canva_user_connections, canva_integrations, canva_designs

-- 1. Helper function for validating positive, non-null, unique integer arrays
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
    -- Rejects null elements, zero, and negative numbers
    IF elem IS NULL OR elem <= 0 THEN
      RETURN FALSE;
    END IF;
    -- Rejects duplicate numbers
    IF elem = ANY(seen) THEN
      RETURN FALSE;
    END IF;
    seen := array_append(seen, elem);
  END LOOP;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 2. Create design_provider_connections table
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

-- 3. Ensure composite unique constraint on pages(id, yearbook_id)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pages_id_yearbook_id_key') THEN
    ALTER TABLE public.pages ADD CONSTRAINT pages_id_yearbook_id_key UNIQUE (id, yearbook_id);
  END IF;
END $$;

-- 4. Create yearbook_design_bindings table
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

-- 5. Create yearbook_design_page_mappings table
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

-- 6. Create proof_generation_jobs table (Preserves audit history on user deletion)
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

-- 7. Create design_provider_assets table
CREATE TABLE IF NOT EXISTS public.design_provider_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_connection_id UUID NOT NULL REFERENCES public.design_provider_connections(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  external_asset_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider_connection_id, asset_id)
);

-- 8. Additive Data Migration Transaction (Preserves existing Super Admin connection & design mappings)
DO $$
DECLARE
  admin_rec RECORD;
  design_rec RECORD;
  new_conn_id UUID;
  new_binding_id UUID;
BEGIN
  -- Copy Super Admin Canva Connection if exists and no active connection present
  SELECT * INTO admin_rec FROM public.canva_user_connections 
  WHERE status = 'connected' 
  ORDER BY updated_at DESC LIMIT 1;

  IF FOUND THEN
    IF NOT EXISTS (SELECT 1 FROM public.design_provider_connections WHERE provider = 'canva' AND is_active = true) THEN
      INSERT INTO public.design_provider_connections (
        provider,
        connected_by,
        encrypted_credentials,
        external_user_id,
        external_team_id,
        display_name,
        scopes,
        is_active,
        status,
        connected_at,
        created_at,
        updated_at
      ) VALUES (
        'canva',
        admin_rec.user_id,
        admin_rec.credentials,
        admin_rec.canva_user_id,
        admin_rec.team_id,
        admin_rec.display_name,
        admin_rec.scopes,
        true,
        'connected',
        admin_rec.created_at,
        admin_rec.created_at,
        admin_rec.updated_at
      ) RETURNING id INTO new_conn_id;
    ELSE
      SELECT id INTO new_conn_id FROM public.design_provider_connections WHERE provider = 'canva' AND is_active = true;
    END IF;

    -- Copy existing active canva_designs into yearbook_design_bindings and page mappings
    FOR design_rec IN 
      SELECT * FROM public.canva_designs 
      WHERE yearbook_id IS NOT NULL AND canva_design_id IS NOT NULL
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.yearbook_design_bindings 
        WHERE yearbook_id = design_rec.yearbook_id AND external_design_id = design_rec.canva_design_id
      ) THEN
        INSERT INTO public.yearbook_design_bindings (
          yearbook_id,
          provider_connection_id,
          external_design_id,
          external_design_title,
          assigned_by,
          assigned_at,
          is_active,
          created_at,
          updated_at
        ) VALUES (
          design_rec.yearbook_id,
          new_conn_id,
          design_rec.canva_design_id,
          COALESCE(design_rec.title, 'Yearbook Layout'),
          design_rec.created_by,
          design_rec.created_at,
          true,
          design_rec.created_at,
          design_rec.updated_at
        ) RETURNING id INTO new_binding_id;
      ELSE
        SELECT id INTO new_binding_id FROM public.yearbook_design_bindings 
        WHERE yearbook_id = design_rec.yearbook_id AND external_design_id = design_rec.canva_design_id;
      END IF;

      -- If design has a mapped page, copy into yearbook_design_page_mappings
      IF design_rec.page_id IS NOT NULL AND new_binding_id IS NOT NULL THEN
        IF NOT EXISTS (
          SELECT 1 FROM public.yearbook_design_page_mappings 
          WHERE binding_id = new_binding_id AND milestone_page_id = design_rec.page_id
        ) THEN
          INSERT INTO public.yearbook_design_page_mappings (
            yearbook_id,
            binding_id,
            milestone_page_id,
            external_page_numbers,
            created_by,
            created_at,
            updated_at
          ) VALUES (
            design_rec.yearbook_id,
            new_binding_id,
            design_rec.page_id,
            CASE 
              WHEN design_rec.canva_pages IS NOT NULL AND jsonb_typeof(design_rec.canva_pages) = 'array' AND jsonb_array_length(design_rec.canva_pages) > 0
              THEN ARRAY(SELECT jsonb_array_elements_text(design_rec.canva_pages)::int)
              ELSE ARRAY[1]
            END,
            design_rec.created_by,
            design_rec.created_at,
            design_rec.updated_at
          ) ON CONFLICT (binding_id, milestone_page_id) DO NOTHING;
        END IF;
      END IF;
    END LOOP;
  END IF;
END $$;
