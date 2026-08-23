-- Migration 009: User-Scoped Canva Connect Integration
-- Creates public.canva_user_connections (user-scoped) and enhances public.canva_designs

-- 1. Create public.canva_user_connections
CREATE TABLE IF NOT EXISTS public.canva_user_connections (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  canva_user_id TEXT,
  team_id TEXT,
  display_name TEXT,
  credentials JSONB NOT NULL DEFAULT '{}'::jsonb,
  scopes TEXT[] NOT NULL DEFAULT '{}'::text[],
  status TEXT NOT NULL DEFAULT 'connected',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Enhance or create public.canva_designs
CREATE TABLE IF NOT EXISTS public.canva_designs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
  page_id UUID REFERENCES public.pages(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  canva_design_id TEXT NOT NULL,
  title TEXT,
  thumbnail_url TEXT,
  edit_url TEXT,
  view_url TEXT,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (yearbook_id, canva_design_id)
);

-- 3. Add page_id, created_by, and last_synced_at columns to canva_designs if table existed previously
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'canva_designs' AND column_name = 'page_id'
  ) THEN
    ALTER TABLE public.canva_designs ADD COLUMN page_id UUID REFERENCES public.pages(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'canva_designs' AND column_name = 'created_by'
  ) THEN
    ALTER TABLE public.canva_designs ADD COLUMN created_by UUID REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'canva_designs' AND column_name = 'last_synced_at'
  ) THEN
    ALTER TABLE public.canva_designs ADD COLUMN last_synced_at TIMESTAMPTZ;
  END IF;
END $$;
