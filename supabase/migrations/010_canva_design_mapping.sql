-- Migration 010: Enhance Canva Design Mapping Columns
-- Adds explicit Center, Section/Spread, Assigned User, Canva Page range, and Export Tracking columns

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'canva_designs' AND column_name = 'center_id'
  ) THEN
    ALTER TABLE public.canva_designs ADD COLUMN center_id UUID REFERENCES public.schools(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'canva_designs' AND column_name = 'spread_id'
  ) THEN
    ALTER TABLE public.canva_designs ADD COLUMN spread_id TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'canva_designs' AND column_name = 'canva_pages'
  ) THEN
    ALTER TABLE public.canva_designs ADD COLUMN canva_pages JSONB DEFAULT '[]'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'canva_designs' AND column_name = 'assigned_user_id'
  ) THEN
    ALTER TABLE public.canva_designs ADD COLUMN assigned_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'canva_designs' AND column_name = 'last_metadata_refresh'
  ) THEN
    ALTER TABLE public.canva_designs ADD COLUMN last_metadata_refresh TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'canva_designs' AND column_name = 'last_proof_export_at'
  ) THEN
    ALTER TABLE public.canva_designs ADD COLUMN last_proof_export_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'canva_designs' AND column_name = 'last_proof_id'
  ) THEN
    ALTER TABLE public.canva_designs ADD COLUMN last_proof_id UUID REFERENCES public.proofs(id) ON DELETE SET NULL;
  END IF;
END $$;
