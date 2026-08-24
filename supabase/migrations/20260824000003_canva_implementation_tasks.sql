-- Migration: 20260824000003_canva_implementation_tasks.sql
-- Description: Creates decoupled Canva Implementation Tasks table and append-only event audit log with composite FKs.

-- 1. Ensure composite unique constraint on corrections
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_corrections_composite'
  ) THEN
    ALTER TABLE public.corrections ADD CONSTRAINT uq_corrections_composite UNIQUE (id, proof_id, yearbook_id);
  END IF;
END $$;

-- 2. Create canva_implementation_tasks table
CREATE TABLE IF NOT EXISTS public.canva_implementation_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  yearbook_id uuid NOT NULL,
  proof_id uuid NOT NULL,
  correction_id uuid NOT NULL,
  page_id uuid,
  page_number integer,
  task_status text NOT NULL DEFAULT 'approved_pending_application'
    CHECK (task_status IN ('approved_pending_application', 'in_progress', 'applied_in_canva', 'rejected', 'verified')),
  assigned_designer_id uuid REFERENCES public.users(id),
  designer_notes text,
  canva_element_id text,
  canva_page_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz,
  verified_at timestamptz,

  -- Enforce same-yearbook composite foreign keys
  CONSTRAINT fk_canva_task_proof_composite FOREIGN KEY (proof_id, yearbook_id)
    REFERENCES public.proofs(id, yearbook_id) ON DELETE CASCADE,
  CONSTRAINT fk_canva_task_correction_composite FOREIGN KEY (correction_id, proof_id, yearbook_id)
    REFERENCES public.corrections(id, proof_id, yearbook_id) ON DELETE CASCADE,
  CONSTRAINT fk_canva_task_page_composite FOREIGN KEY (page_id, yearbook_id)
    REFERENCES public.pages(id, yearbook_id) ON DELETE SET NULL,

  -- Prevent duplicate tasks per source correction
  CONSTRAINT uq_canva_task_correction UNIQUE (correction_id)
);

-- 3. Create append-only task events table for audit trail
CREATE TABLE IF NOT EXISTS public.canva_implementation_task_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.canva_implementation_tasks(id) ON DELETE CASCADE,
  yearbook_id uuid NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES public.users(id),
  event_type text NOT NULL CHECK (event_type IN ('created', 'status_change', 'notes_updated', 'applied', 'verified', 'rejected')),
  previous_status text,
  new_status text,
  notes text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_canva_tasks_yearbook ON public.canva_implementation_tasks(yearbook_id);
CREATE INDEX IF NOT EXISTS idx_canva_tasks_proof ON public.canva_implementation_tasks(proof_id);
CREATE INDEX IF NOT EXISTS idx_canva_tasks_status ON public.canva_implementation_tasks(task_status);
CREATE INDEX IF NOT EXISTS idx_canva_task_events_task ON public.canva_implementation_task_events(task_id);
