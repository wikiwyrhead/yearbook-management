-- ==================================================
-- MIGRATION: PLATFORM OPERATING MODE (SINGLE / MULTI CENTER)
-- ==================================================

-- 1. Ensure is_active column on public.schools
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- 2. Platform Settings Singleton Table
CREATE TABLE IF NOT EXISTS public.platform_settings (
  id TEXT PRIMARY KEY DEFAULT 'global' CHECK (id = 'global'),
  operating_mode TEXT NOT NULL DEFAULT 'multi_center' CHECK (operating_mode IN ('single_center', 'multi_center')),
  primary_center_id UUID REFERENCES public.schools(id) ON DELETE SET NULL,
  changed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_single_center_has_primary CHECK (
    operating_mode = 'multi_center' OR primary_center_id IS NOT NULL
  )
);

-- Seed Singleton Row
INSERT INTO public.platform_settings (id, operating_mode, primary_center_id)
VALUES ('global', 'multi_center', NULL)
ON CONFLICT (id) DO NOTHING;

-- 3. Truly Immutable Platform Settings History Table (Preserves both previous and new state)
CREATE TABLE IF NOT EXISTS public.platform_settings_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  previous_operating_mode TEXT NOT NULL,
  new_operating_mode TEXT NOT NULL,
  previous_primary_center_id UUID,
  previous_primary_center_name TEXT,
  new_primary_center_id UUID,
  new_primary_center_name TEXT,
  changed_by UUID,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Block application-level UPDATE and DELETE on history table
CREATE OR REPLACE FUNCTION public.block_platform_settings_history_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'platform_settings_history is append-only and immutable.';
END;
$$;

DROP TRIGGER IF EXISTS trg_block_history_mutation ON public.platform_settings_history;
CREATE TRIGGER trg_block_history_mutation
BEFORE UPDATE OR DELETE ON public.platform_settings_history
FOR EACH ROW EXECUTE FUNCTION public.block_platform_settings_history_mutation();

-- 4. Prevent Deletion & Deactivation of Active Primary Center (Distinct error messages)
CREATE OR REPLACE FUNCTION public.check_primary_center_integrity()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Check Deletion
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (
      SELECT 1 FROM public.platform_settings
      WHERE id = 'global'
        AND operating_mode = 'single_center'
        AND primary_center_id = OLD.id
    ) THEN
      RAISE EXCEPTION 'Cannot delete active Primary Center "%" while Single-Center operating mode is enabled. Restore Multiple-Center mode or select a different Primary Center first.', OLD.name;
    END IF;
    RETURN OLD;
  END IF;

  -- Check Deactivation
  IF TG_OP = 'UPDATE' THEN
    IF (OLD.is_active = true AND NEW.is_active = false) AND EXISTS (
      SELECT 1 FROM public.platform_settings
      WHERE id = 'global'
        AND operating_mode = 'single_center'
        AND primary_center_id = OLD.id
    ) THEN
      RAISE EXCEPTION 'Cannot deactivate active Primary Center "%" while Single-Center operating mode is enabled. Restore Multiple-Center mode or select a different Primary Center first.', OLD.name;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_primary_center_modification ON public.schools;
CREATE TRIGGER trg_prevent_primary_center_modification
BEFORE DELETE OR UPDATE OF is_active ON public.schools
FOR EACH ROW EXECUTE FUNCTION public.check_primary_center_integrity();
