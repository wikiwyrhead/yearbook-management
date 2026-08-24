-- Migration: 20260824000004_classify_historical_proofs.sql
-- Description: Adds round_classification and official_round_number with strict integrity constraints.

-- 1. Add round_classification column with explicit 'unknown' state (NO DEFAULT to prevent silent misclassification)
ALTER TABLE public.proofs ADD COLUMN IF NOT EXISTS round_classification text;

-- 2. Add official_round_number column for decoupled display sequence
ALTER TABLE public.proofs ADD COLUMN IF NOT EXISTS official_round_number integer;

-- 3. Enforce uniqueness on official round number per yearbook for official proofs
CREATE UNIQUE INDEX IF NOT EXISTS uq_official_round_number 
  ON public.proofs (yearbook_id, official_round_number) 
  WHERE round_classification = 'official_master';

-- 4. Initial safe backfill: set all existing unclassified rows to 'unknown'
UPDATE public.proofs SET round_classification = 'unknown' WHERE round_classification IS NULL;

-- 5. Evidence-based reclassification for documented records:
-- Milestone 2025: Round 1 is the authentic initial master
UPDATE public.proofs 
SET round_classification = 'official_master', official_round_number = 1 
WHERE id IN ('493a38a3-2ea9-42b7-a367-96a93b4970ee', '2a174002-707e-4303-a38c-6b2ce1196e0f');

-- Legacy & Horizons: Page 10 single-page render preview
UPDATE public.proofs 
SET round_classification = 'legacy_preview' 
WHERE id = '04fe3a0f-645c-4c75-a22d-2161403bce53'; -- Round 206 "Page 10 Proof v17"

-- Legacy & Horizons: Documented test suite rounds
UPDATE public.proofs 
SET round_classification = 'development_test' 
WHERE id IN (
  '3de89629-558c-4507-975b-87936d754ff8', -- Round 220
  'c495dc75-39d2-4df4-b030-656093be11f3'  -- Round 221
);

-- Note: All other rounds (Rounds 1–219 of Legacy & Horizons) remain strictly 'unknown' pending corroborating evidence.

-- 6. Make round_classification NOT NULL
ALTER TABLE public.proofs ALTER COLUMN round_classification SET NOT NULL;

-- 7. Add check constraint on round_classification enum values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public' AND rel.relname = 'proofs' AND con.conname = 'chk_proof_round_classification_enum'
  ) THEN
    ALTER TABLE public.proofs ADD CONSTRAINT chk_proof_round_classification_enum CHECK (
      round_classification IN ('official_master', 'legacy_preview', 'development_test', 'unknown')
    );
  END IF;
END $$;

-- 8. Idempotent check constraint for official_round_number scoped to public.proofs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public' AND rel.relname = 'proofs' AND con.conname = 'chk_proof_official_round_number'
  ) THEN
    ALTER TABLE public.proofs ADD CONSTRAINT chk_proof_official_round_number CHECK (
      (round_classification = 'official_master' AND official_round_number IS NOT NULL AND official_round_number > 0)
      OR
      (round_classification != 'official_master' AND official_round_number IS NULL)
    );
  END IF;
END $$;
