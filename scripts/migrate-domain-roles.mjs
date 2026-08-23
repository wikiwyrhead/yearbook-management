import pg from "pg";
import fs from "fs";

if (fs.existsSync(".env")) {
  const lines = fs.readFileSync(".env", "utf8").split("\n");
  for (const line of lines) {
    const m = line.match(/^\s*([\w_]+)\s*=\s*(.*)?\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
    }
  }
}

const { Pool } = pg;
let dbUrl =
  process.env.DATABASE_URL ||
  `postgresql://${process.env.POSTGRES_USER || "yearbook_user"}:${process.env.POSTGRES_PASSWORD || "yearbook_dev_secret_pass_2026"}@localhost:5432/${process.env.POSTGRES_DB || "yearbook_db"}`;
if (dbUrl.includes("@postgres:")) {
  dbUrl = dbUrl.replace("@postgres:", "@localhost:");
}
const pool = new Pool({
  connectionString: dbUrl,
});

export async function runMigration() {
  const client = await pool.connect();
  try {
    console.log("[Migration] Starting transactional domain model migration...");
    await client.query("BEGIN");

    // 1. Standardized view for centers
    console.log("[Migration] 1. Creating centers view...");
    await client.query(`
      CREATE OR REPLACE VIEW public.centers AS
      SELECT * FROM public.schools;
    `);

    // 2. Center Memberships Table
    console.log("[Migration] 2. Creating center_memberships table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.center_memberships (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        center_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
        user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
        member_type TEXT NOT NULL CHECK (member_type IN ('teacher', 'student')),
        start_date DATE NOT NULL DEFAULT CURRENT_DATE,
        end_date DATE,
        is_active BOOLEAN NOT NULL DEFAULT true,
        assigned_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT chk_center_membership_dates CHECK (end_date IS NULL OR end_date >= start_date)
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_active_center_membership
        ON public.center_memberships (center_id, user_id)
        WHERE is_active = true;
    `);

    // 3. Center Role Appointments Table
    console.log("[Migration] 3. Creating center_role_appointments table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.center_role_appointments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        center_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
        user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
        role TEXT NOT NULL DEFAULT 'coordinator' CHECK (role = 'coordinator'),
        start_date DATE NOT NULL DEFAULT CURRENT_DATE,
        end_date DATE,
        is_active BOOLEAN NOT NULL DEFAULT true,
        assigned_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT chk_center_appointment_dates CHECK (end_date IS NULL OR end_date >= start_date)
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_active_coordinator_appointment
        ON public.center_role_appointments (center_id, user_id)
        WHERE is_active = true AND role = 'coordinator';
    `);

    // 4. Ensure composite unique constraints on parent tables
    console.log("[Migration] 4. Ensuring composite constraints on pages and sections...");
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'uq_pages_id_yearbook'
        ) THEN
          ALTER TABLE public.pages ADD CONSTRAINT uq_pages_id_yearbook UNIQUE (id, yearbook_id);
        END IF;
      END $$;

      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'uq_sections_id_yearbook'
        ) THEN
          ALTER TABLE public.sections ADD CONSTRAINT uq_sections_id_yearbook UNIQUE (id, yearbook_id);
        END IF;
      END $$;
    `);

    // 5. Annual Yearbook Team Assignments Table
    console.log("[Migration] 5. Creating yearbook_team_assignments table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.yearbook_team_assignments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        yearbook_id UUID NOT NULL REFERENCES public.yearbooks(id) ON DELETE RESTRICT,
        user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
        center_membership_id UUID REFERENCES public.center_memberships(id) ON DELETE SET NULL,
        role TEXT NOT NULL CHECK (role IN ('advisor', 'editorial_member', 'student_contributor')),
        start_date DATE NOT NULL DEFAULT CURRENT_DATE,
        end_date DATE,
        is_active BOOLEAN NOT NULL DEFAULT true,
        assigned_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT chk_yearbook_assignment_dates CHECK (end_date IS NULL OR end_date >= start_date),
        CONSTRAINT uq_yearbook_assignment_composite UNIQUE (id, yearbook_id)
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_active_yearbook_assignment
        ON public.yearbook_team_assignments (yearbook_id, user_id, role)
        WHERE is_active = true;
    `);

    // 6. Relational Page & Section Assignments with Composite Foreign Keys
    console.log("[Migration] 6. Creating relational page & section assignment tables...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.yearbook_assignment_pages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        assignment_id UUID NOT NULL,
        page_id UUID NOT NULL,
        yearbook_id UUID NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        FOREIGN KEY (assignment_id, yearbook_id) REFERENCES public.yearbook_team_assignments(id, yearbook_id) ON DELETE CASCADE,
        FOREIGN KEY (page_id, yearbook_id) REFERENCES public.pages(id, yearbook_id) ON DELETE CASCADE,
        UNIQUE (assignment_id, page_id)
      );

      CREATE TABLE IF NOT EXISTS public.yearbook_assignment_sections (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        assignment_id UUID NOT NULL,
        section_id UUID NOT NULL,
        yearbook_id UUID NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        FOREIGN KEY (assignment_id, yearbook_id) REFERENCES public.yearbook_team_assignments(id, yearbook_id) ON DELETE CASCADE,
        FOREIGN KEY (section_id, yearbook_id) REFERENCES public.sections(id, yearbook_id) ON DELETE CASCADE,
        UNIQUE (assignment_id, section_id)
      );
    `);

    // 7. Granular Authorization Helper Functions
    console.log("[Migration] 7. Installing granular authorization functions...");
    await client.query(`
      -- A. Active Coordinator check
      CREATE OR REPLACE FUNCTION public.is_active_coordinator(_user_id uuid, _center_id uuid)
      RETURNS boolean LANGUAGE sql STABLE AS $$
        SELECT public.is_super_admin(_user_id) OR EXISTS (
          SELECT 1 FROM public.center_role_appointments
          WHERE user_id = _user_id
            AND center_id = _center_id
            AND role = 'coordinator'
            AND is_active = true
            AND start_date <= CURRENT_DATE
            AND (end_date IS NULL OR end_date >= CURRENT_DATE)
        );
      $$;

      -- B. Center Role Management (Super Admin ONLY)
      CREATE OR REPLACE FUNCTION public.can_manage_center_roles(_user_id uuid, _center_id uuid)
      RETURNS boolean LANGUAGE sql STABLE AS $$
        SELECT public.is_super_admin(_user_id);
      $$;

      -- C. Yearbook Management (Super Admin OR Active Center Coordinator)
      CREATE OR REPLACE FUNCTION public.can_manage_yearbook(_user_id uuid, _yearbook_id uuid)
      RETURNS boolean LANGUAGE sql STABLE AS $$
        SELECT public.is_super_admin(_user_id) OR EXISTS (
          SELECT 1 FROM public.yearbooks y
          JOIN public.center_role_appointments a ON a.center_id = y.school_id
          WHERE y.id = _yearbook_id
            AND a.user_id = _user_id
            AND a.role = 'coordinator'
            AND a.is_active = true
            AND a.start_date <= CURRENT_DATE
            AND (a.end_date IS NULL OR a.end_date >= CURRENT_DATE)
        );
      $$;

      -- D. Editorial Team Management (Super Admin OR Active Center Coordinator)
      CREATE OR REPLACE FUNCTION public.can_manage_editorial_team(_user_id uuid, _yearbook_id uuid)
      RETURNS boolean LANGUAGE sql STABLE AS $$
        SELECT public.can_manage_yearbook(_user_id, _yearbook_id);
      $$;

      -- E. Page-Specific Editing Permission
      CREATE OR REPLACE FUNCTION public.can_edit_assigned_page(_user_id uuid, _yearbook_id uuid, _page_id uuid)
      RETURNS boolean LANGUAGE sql STABLE AS $$
        SELECT public.is_super_admin(_user_id)
          -- Active Coordinator of the Center
          OR public.can_manage_yearbook(_user_id, _yearbook_id)
          -- Active Advisor assigned to the Yearbook
          OR EXISTS (
            SELECT 1 FROM public.yearbook_team_assignments a
            WHERE a.yearbook_id = _yearbook_id
              AND a.user_id = _user_id
              AND a.role = 'advisor'
              AND a.is_active = true
              AND a.start_date <= CURRENT_DATE
              AND (a.end_date IS NULL OR a.end_date >= CURRENT_DATE)
          )
          -- Active Editorial Member assigned specifically to this page or its section
          OR EXISTS (
            SELECT 1 FROM public.yearbook_team_assignments a
            LEFT JOIN public.yearbook_assignment_pages ap ON ap.assignment_id = a.id
            LEFT JOIN public.yearbook_assignment_sections asec ON asec.assignment_id = a.id
            LEFT JOIN public.pages p ON p.id = _page_id
            WHERE a.yearbook_id = _yearbook_id
              AND a.user_id = _user_id
              AND a.role = 'editorial_member'
              AND a.is_active = true
              AND a.start_date <= CURRENT_DATE
              AND (a.end_date IS NULL OR a.end_date >= CURRENT_DATE)
              AND (ap.page_id = _page_id OR (asec.section_id IS NOT NULL AND asec.section_id = p.section_id))
          );
      $$;

      -- F. Page-Specific Proof Review Permission
      CREATE OR REPLACE FUNCTION public.can_review_proof_page(_user_id uuid, _yearbook_id uuid, _page_id uuid)
      RETURNS boolean LANGUAGE sql STABLE AS $$
        SELECT public.can_edit_assigned_page(_user_id, _yearbook_id, _page_id);
      $$;

      -- G. Approval and Final Locking Permission (Super Admin or Active Coordinator ONLY)
      CREATE OR REPLACE FUNCTION public.can_approve_and_lock(_user_id uuid, _yearbook_id uuid)
      RETURNS boolean LANGUAGE sql STABLE AS $$
        SELECT public.can_manage_yearbook(_user_id, _yearbook_id);
      $$;
    `);

    // 8. Backfill existing data
    console.log(
      "[Migration] 8. Backfilling memberships, appointments, and assignments from existing records...",
    );

    // Backfill Center Coordinators from existing schools / yearbook coordinators (excluding global super_admin)
    await client.query(`
      INSERT INTO public.center_role_appointments (center_id, user_id, role, is_active, start_date, assigned_by)
      SELECT DISTINCT y.school_id, m.user_id, 'coordinator', true, CURRENT_DATE, y.created_by
      FROM public.yearbook_members m
      JOIN public.yearbooks y ON y.id = m.yearbook_id
      WHERE m.role = 'coordinator'
        AND NOT EXISTS (
          SELECT 1 FROM public.user_roles ur 
          WHERE ur.user_id = m.user_id AND ur.role = 'super_admin'
        )
      ON CONFLICT DO NOTHING;
    `);

    // Backfill Center Students from existing students table
    await client.query(`
      INSERT INTO public.center_memberships (center_id, user_id, member_type, is_active, start_date)
      SELECT DISTINCT y.school_id, s.user_id, 'student', true, CURRENT_DATE
      FROM public.students s
      JOIN public.yearbooks y ON y.id = s.yearbook_id
      WHERE s.user_id IS NOT NULL
      ON CONFLICT DO NOTHING;
    `);

    // Backfill Center Teachers from existing faculty table
    await client.query(`
      INSERT INTO public.center_memberships (center_id, user_id, member_type, is_active, start_date)
      SELECT DISTINCT y.school_id, f.user_id, 'teacher', true, CURRENT_DATE
      FROM public.faculty f
      JOIN public.yearbooks y ON y.id = f.yearbook_id
      WHERE f.user_id IS NOT NULL
      ON CONFLICT DO NOTHING;
    `);

    // Backfill Yearbook Team Assignments from yearbook_members (non-coordinator)
    await client.query(`
      INSERT INTO public.yearbook_team_assignments (yearbook_id, user_id, role, is_active, start_date)
      SELECT m.yearbook_id, m.user_id,
        CASE
          WHEN m.role = 'staff' THEN 'editorial_member'
          WHEN m.role = 'student' THEN 'student_contributor'
          ELSE 'editorial_member'
        END,
        true, CURRENT_DATE
      FROM public.yearbook_members m
      WHERE m.role <> 'coordinator'
      ON CONFLICT DO NOTHING;
    `);

    // 9. Verification queries
    const counts = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM public.schools) as total_centers,
        (SELECT COUNT(*) FROM public.center_memberships) as total_memberships,
        (SELECT COUNT(*) FROM public.center_role_appointments) as total_appointments,
        (SELECT COUNT(*) FROM public.yearbook_team_assignments) as total_assignments;
    `);

    console.log("[Migration] Migration verification metrics:", counts.rows[0]);

    await client.query("COMMIT");
    console.log("[Migration] Transaction committed successfully!");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[Migration] Error during migration, rolled back:", err);
    throw err;
  } finally {
    client.release();
  }
}

if (process.argv[1]?.endsWith("migrate-domain-roles.mjs")) {
  runMigration()
    .then(() => pool.end())
    .catch((err) => {
      console.error(err);
      pool.end().finally(() => process.exit(1));
    });
}
