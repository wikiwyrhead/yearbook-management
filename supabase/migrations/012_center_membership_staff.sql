-- Migration 012: Add canonical 'staff' to center_memberships member_type check constraint
-- Supports unambiguous separation of permanent Staff/Member from annual Student Editorial Member.

DO $$
BEGIN
  -- Drop existing check constraint if it restricts to ('teacher', 'student')
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'center_memberships_member_type_check'
  ) THEN
    ALTER TABLE public.center_memberships DROP CONSTRAINT center_memberships_member_type_check;
  END IF;

  -- Add updated check constraint allowing ('teacher', 'student', 'staff')
  ALTER TABLE public.center_memberships
    ADD CONSTRAINT center_memberships_member_type_check
    CHECK (member_type IN ('teacher', 'student', 'staff'));
END $$;
