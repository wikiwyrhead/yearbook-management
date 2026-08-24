-- Migration: 20260824000001_production_triggers_and_signoffs.sql
-- Purpose: Corrective trigger updates, append-only signoff enforcement, and unconfirmed spec field nullability

-- 1. Allow unconfirmed production print specifications to have NULL specification fields
ALTER TABLE public.production_print_specifications ALTER COLUMN bleed_size DROP NOT NULL;
ALTER TABLE public.production_print_specifications ALTER COLUMN print_quantity DROP NOT NULL;
ALTER TABLE public.production_print_specifications ALTER COLUMN color_profile DROP NOT NULL;
ALTER TABLE public.production_print_specifications ALTER COLUMN paper_stock_interior DROP NOT NULL;
ALTER TABLE public.production_print_specifications ALTER COLUMN paper_stock_cover DROP NOT NULL;
ALTER TABLE public.production_print_specifications ALTER COLUMN binding_type DROP NOT NULL;
ALTER TABLE public.production_print_specifications ALTER COLUMN cover_finish DROP NOT NULL;

-- 2. Catalog active columns
ALTER TABLE public.section_categories ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.layout_types ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- 3. Trigger: Prevent child record mutation on locked proofs
CREATE OR REPLACE FUNCTION public.fn_prevent_locked_child_mutation()
RETURNS TRIGGER AS $$
DECLARE
  v_proof_status public.proof_version_status;
BEGIN
  SELECT proof_version_status INTO v_proof_status 
  FROM public.proofs 
  WHERE id = NEW.proof_id;

  IF v_proof_status IS NOT NULL AND v_proof_status IN ('locked', 'final_candidate', 'institutionally_approved', 'released_for_production', 'superseded') THEN
    RAISE EXCEPTION 'Cannot insert or update child records for locked, finalized, or superseded proof version % (status: %)', NEW.proof_id, v_proof_status;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_locked_proof_pages_mutation ON public.proof_pages;
CREATE TRIGGER trg_prevent_locked_proof_pages_mutation
  BEFORE INSERT OR UPDATE ON public.proof_pages
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_prevent_locked_child_mutation();

DROP TRIGGER IF EXISTS trg_prevent_locked_corrections_mutation ON public.corrections;
DROP TRIGGER IF EXISTS trg_prevent_locked_correction_mutation ON public.corrections;
CREATE TRIGGER trg_prevent_locked_corrections_mutation
  BEFORE INSERT OR UPDATE ON public.corrections
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_prevent_locked_child_mutation();

DROP TRIGGER IF EXISTS trg_prevent_locked_corr_attach_mutation ON public.correction_attachments;
DROP TRIGGER IF EXISTS trg_prevent_locked_attachment_mutation ON public.correction_attachments;
CREATE TRIGGER trg_prevent_locked_corr_attach_mutation
  BEFORE INSERT OR UPDATE ON public.correction_attachments
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_prevent_locked_child_mutation();

DROP TRIGGER IF EXISTS trg_prevent_locked_corr_links_mutation ON public.correction_reference_links;
DROP TRIGGER IF EXISTS trg_prevent_locked_reference_links_mutation ON public.correction_reference_links;
CREATE TRIGGER trg_prevent_locked_corr_links_mutation
  BEFORE INSERT OR UPDATE ON public.correction_reference_links
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_prevent_locked_child_mutation();

-- 4. Trigger: Signoff Requirements Immutability on locked proofs
CREATE OR REPLACE FUNCTION public.fn_prevent_locked_signoff_req_mutation()
RETURNS TRIGGER AS $$
DECLARE
  v_proof_id UUID;
  v_proof_status public.proof_version_status;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_proof_id := OLD.proof_id;
  ELSE
    v_proof_id := NEW.proof_id;
  END IF;

  SELECT proof_version_status INTO v_proof_status 
  FROM public.proofs 
  WHERE id = v_proof_id;

  IF v_proof_status IS NOT NULL AND v_proof_status IN ('locked', 'institutionally_approved', 'released_for_production', 'superseded') THEN
    RAISE EXCEPTION 'Cannot modify signoff requirements for locked, approved, or superseded proof version % (status: %)', v_proof_id, v_proof_status;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_locked_signoff_req_mutation ON public.proof_signoff_requirements;
CREATE TRIGGER trg_prevent_locked_signoff_req_mutation
  BEFORE INSERT OR UPDATE OR DELETE ON public.proof_signoff_requirements
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_prevent_locked_signoff_req_mutation();

-- 5. Trigger: Signoff Decisions Append-Only Enforcement (STRICTLY BLOCK UPDATE and DELETE)
CREATE OR REPLACE FUNCTION public.fn_enforce_signoff_decision_append_only()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    RAISE EXCEPTION 'Proof signoff decisions are strictly append-only and cannot be updated or deleted.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_locked_signoff_dec_mutation ON public.proof_signoff_decisions;
DROP TRIGGER IF EXISTS trg_enforce_signoff_decision_append_only ON public.proof_signoff_decisions;
CREATE TRIGGER trg_enforce_signoff_decision_append_only
  BEFORE UPDATE OR DELETE ON public.proof_signoff_decisions
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_enforce_signoff_decision_append_only();
