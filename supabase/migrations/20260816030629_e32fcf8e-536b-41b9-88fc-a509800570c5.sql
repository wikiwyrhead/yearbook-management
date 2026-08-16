-- ENUMS
CREATE TYPE public.app_role AS ENUM ('super_admin');
CREATE TYPE public.yearbook_role AS ENUM ('coordinator','staff','proofreader','corrector','student');

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'super_admin'::public.app_role);
$$;

CREATE TABLE public.schools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  short_name text,
  logo_url text,
  address text,
  contact_name text,
  contact_email text,
  contact_phone text,
  notes text,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schools TO authenticated;
GRANT ALL ON public.schools TO service_role;
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.yearbooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  year integer NOT NULL,
  title text,
  theme text,
  page_count integer NOT NULL DEFAULT 0,
  deadline date,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, year)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.yearbooks TO authenticated;
GRANT ALL ON public.yearbooks TO service_role;
ALTER TABLE public.yearbooks ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.yearbook_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  yearbook_id uuid NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role public.yearbook_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (yearbook_id, user_id, role)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.yearbook_members TO authenticated;
GRANT ALL ON public.yearbook_members TO service_role;
ALTER TABLE public.yearbook_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_yearbook_role(_user_id uuid, _yearbook_id uuid, _role public.yearbook_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin(_user_id) OR EXISTS (
    SELECT 1 FROM public.yearbook_members
    WHERE user_id = _user_id AND yearbook_id = _yearbook_id AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.is_yearbook_member(_user_id uuid, _yearbook_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin(_user_id) OR EXISTS (
    SELECT 1 FROM public.yearbook_members WHERE user_id = _user_id AND yearbook_id = _yearbook_id
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_yearbook(_user_id uuid, _yearbook_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_yearbook_role(_user_id, _yearbook_id, 'coordinator'::public.yearbook_role);
$$;

CREATE OR REPLACE FUNCTION public.can_edit_yearbook(_user_id uuid, _yearbook_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin(_user_id) OR EXISTS (
    SELECT 1 FROM public.yearbook_members
    WHERE user_id = _user_id AND yearbook_id = _yearbook_id
      AND role IN ('coordinator'::public.yearbook_role,'staff'::public.yearbook_role)
  );
$$;

CREATE OR REPLACE FUNCTION public.is_yearbook_staff_member(_user_id uuid, _yearbook_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin(_user_id) OR EXISTS (
    SELECT 1 FROM public.yearbook_members
    WHERE user_id = _user_id AND yearbook_id = _yearbook_id
      AND role <> 'student'::public.yearbook_role
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_school(_user_id uuid, _school_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin(_user_id)
    OR EXISTS (SELECT 1 FROM public.schools s WHERE s.id = _school_id AND s.created_by = _user_id)
    OR EXISTS (
      SELECT 1 FROM public.yearbooks y
      JOIN public.yearbook_members m ON m.yearbook_id = y.id
      WHERE y.school_id = _school_id AND m.user_id = _user_id
    );
$$;

CREATE TABLE public.sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  yearbook_id uuid NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#64748b',
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.page_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  yearbook_id uuid NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.page_statuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  yearbook_id uuid NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#64748b',
  position integer NOT NULL DEFAULT 0,
  is_terminal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  yearbook_id uuid NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
  name text NOT NULL,
  grade text,
  homeroom text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  yearbook_id uuid NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
  class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  user_id uuid,
  student_number text,
  first_name text NOT NULL,
  middle_name text,
  last_name text NOT NULL,
  preferred_name text,
  suffix text,
  grade text,
  email text,
  submission_status text NOT NULL DEFAULT 'pending',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.faculty (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  yearbook_id uuid NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
  user_id uuid,
  first_name text NOT NULL,
  middle_name text,
  last_name text NOT NULL,
  preferred_name text,
  suffix text,
  title text,
  department text,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  yearbook_id uuid NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
  section_id uuid REFERENCES public.sections(id) ON DELETE SET NULL,
  page_type_id uuid REFERENCES public.page_types(id) ON DELETE SET NULL,
  status_id uuid REFERENCES public.page_statuses(id) ON DELETE SET NULL,
  position integer NOT NULL DEFAULT 0,
  page_number integer,
  title text,
  description text,
  required_assets text,
  notes text,
  blocking_reason text,
  canva_design_id text,
  canva_design_url text,
  canva_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.page_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES public.pages(id) ON DELETE CASCADE,
  yearbook_id uuid NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
  label text NOT NULL,
  needed integer NOT NULL DEFAULT 0,
  have integer NOT NULL DEFAULT 0,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.page_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES public.pages(id) ON DELETE CASCADE,
  yearbook_id uuid NOT NULL REFERENCES public.yearbooks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  kind text NOT NULL DEFAULT 'designer',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (page_id, user_id, kind)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sections, public.page_types, public.page_statuses, public.classes, public.students, public.faculty, public.pages, public.page_requirements, public.page_assignments TO authenticated;
GRANT ALL ON public.sections, public.page_types, public.page_statuses, public.classes, public.students, public.faculty, public.pages, public.page_requirements, public.page_assignments TO service_role;

ALTER TABLE public.sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.page_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.page_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faculty ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.page_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.page_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_insert_self" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_update_self" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY "user_roles_select_self" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin(auth.uid()));

CREATE POLICY "schools_select" ON public.schools FOR SELECT TO authenticated
  USING (public.can_access_school(auth.uid(), id));
CREATE POLICY "schools_insert" ON public.schools FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
CREATE POLICY "schools_update" ON public.schools FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.is_super_admin(auth.uid()));
CREATE POLICY "schools_delete" ON public.schools FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.is_super_admin(auth.uid()));

CREATE POLICY "yearbooks_select" ON public.yearbooks FOR SELECT TO authenticated
  USING (public.is_yearbook_member(auth.uid(), id) OR public.can_access_school(auth.uid(), school_id));
CREATE POLICY "yearbooks_insert" ON public.yearbooks FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND public.can_access_school(auth.uid(), school_id));
CREATE POLICY "yearbooks_update" ON public.yearbooks FOR UPDATE TO authenticated
  USING (public.can_manage_yearbook(auth.uid(), id));
CREATE POLICY "yearbooks_delete" ON public.yearbooks FOR DELETE TO authenticated
  USING (public.can_manage_yearbook(auth.uid(), id));

CREATE POLICY "members_select" ON public.yearbook_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_yearbook_staff_member(auth.uid(), yearbook_id));
CREATE POLICY "members_insert" ON public.yearbook_members FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_yearbook(auth.uid(), yearbook_id));
CREATE POLICY "members_update" ON public.yearbook_members FOR UPDATE TO authenticated
  USING (public.can_manage_yearbook(auth.uid(), yearbook_id));
CREATE POLICY "members_delete" ON public.yearbook_members FOR DELETE TO authenticated
  USING (public.can_manage_yearbook(auth.uid(), yearbook_id));

CREATE POLICY "sections_select" ON public.sections FOR SELECT TO authenticated USING (public.is_yearbook_member(auth.uid(), yearbook_id));
CREATE POLICY "sections_write" ON public.sections FOR ALL TO authenticated USING (public.can_manage_yearbook(auth.uid(), yearbook_id)) WITH CHECK (public.can_manage_yearbook(auth.uid(), yearbook_id));

CREATE POLICY "page_types_select" ON public.page_types FOR SELECT TO authenticated USING (public.is_yearbook_member(auth.uid(), yearbook_id));
CREATE POLICY "page_types_write" ON public.page_types FOR ALL TO authenticated USING (public.can_manage_yearbook(auth.uid(), yearbook_id)) WITH CHECK (public.can_manage_yearbook(auth.uid(), yearbook_id));

CREATE POLICY "page_statuses_select" ON public.page_statuses FOR SELECT TO authenticated USING (public.is_yearbook_member(auth.uid(), yearbook_id));
CREATE POLICY "page_statuses_write" ON public.page_statuses FOR ALL TO authenticated USING (public.can_manage_yearbook(auth.uid(), yearbook_id)) WITH CHECK (public.can_manage_yearbook(auth.uid(), yearbook_id));

CREATE POLICY "classes_select" ON public.classes FOR SELECT TO authenticated USING (public.is_yearbook_staff_member(auth.uid(), yearbook_id));
CREATE POLICY "classes_write" ON public.classes FOR ALL TO authenticated USING (public.can_edit_yearbook(auth.uid(), yearbook_id)) WITH CHECK (public.can_edit_yearbook(auth.uid(), yearbook_id));

CREATE POLICY "students_select" ON public.students FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_yearbook_staff_member(auth.uid(), yearbook_id));
CREATE POLICY "students_write" ON public.students FOR ALL TO authenticated
  USING (public.can_edit_yearbook(auth.uid(), yearbook_id)) WITH CHECK (public.can_edit_yearbook(auth.uid(), yearbook_id));

CREATE POLICY "faculty_select" ON public.faculty FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_yearbook_staff_member(auth.uid(), yearbook_id));
CREATE POLICY "faculty_write" ON public.faculty FOR ALL TO authenticated
  USING (public.can_edit_yearbook(auth.uid(), yearbook_id)) WITH CHECK (public.can_edit_yearbook(auth.uid(), yearbook_id));

CREATE POLICY "pages_select" ON public.pages FOR SELECT TO authenticated USING (public.is_yearbook_staff_member(auth.uid(), yearbook_id));
CREATE POLICY "pages_insert" ON public.pages FOR INSERT TO authenticated WITH CHECK (public.can_edit_yearbook(auth.uid(), yearbook_id));
CREATE POLICY "pages_update" ON public.pages FOR UPDATE TO authenticated
  USING (
    public.can_edit_yearbook(auth.uid(), yearbook_id)
    OR EXISTS (SELECT 1 FROM public.page_assignments a WHERE a.page_id = pages.id AND a.user_id = auth.uid())
  );
CREATE POLICY "pages_delete" ON public.pages FOR DELETE TO authenticated USING (public.can_manage_yearbook(auth.uid(), yearbook_id));

CREATE POLICY "page_requirements_select" ON public.page_requirements FOR SELECT TO authenticated USING (public.is_yearbook_staff_member(auth.uid(), yearbook_id));
CREATE POLICY "page_requirements_write" ON public.page_requirements FOR ALL TO authenticated
  USING (
    public.can_edit_yearbook(auth.uid(), yearbook_id)
    OR EXISTS (SELECT 1 FROM public.page_assignments a WHERE a.page_id = page_requirements.page_id AND a.user_id = auth.uid())
  )
  WITH CHECK (
    public.can_edit_yearbook(auth.uid(), yearbook_id)
    OR EXISTS (SELECT 1 FROM public.page_assignments a WHERE a.page_id = page_requirements.page_id AND a.user_id = auth.uid())
  );

CREATE POLICY "page_assignments_select" ON public.page_assignments FOR SELECT TO authenticated USING (public.is_yearbook_staff_member(auth.uid(), yearbook_id));
CREATE POLICY "page_assignments_write" ON public.page_assignments FOR ALL TO authenticated
  USING (public.can_edit_yearbook(auth.uid(), yearbook_id)) WITH CHECK (public.can_edit_yearbook(auth.uid(), yearbook_id));

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_schools_updated BEFORE UPDATE ON public.schools FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_yearbooks_updated BEFORE UPDATE ON public.yearbooks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_classes_updated BEFORE UPDATE ON public.classes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_students_updated BEFORE UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_faculty_updated BEFORE UPDATE ON public.faculty FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_pages_updated BEFORE UPDATE ON public.pages FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_page_requirements_updated BEFORE UPDATE ON public.page_requirements FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', NEW.email))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.handle_new_yearbook()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.yearbook_members (yearbook_id, user_id, role)
  VALUES (NEW.id, NEW.created_by, 'coordinator') ON CONFLICT DO NOTHING;

  INSERT INTO public.sections (yearbook_id, name, color, position) VALUES
    (NEW.id, 'Front Matter', '#0ea5e9', 1),
    (NEW.id, 'Portraits', '#8b5cf6', 2),
    (NEW.id, 'Academics', '#22c55e', 3),
    (NEW.id, 'Clubs & Activities', '#f59e0b', 4),
    (NEW.id, 'Sports', '#ef4444', 5),
    (NEW.id, 'Events', '#14b8a6', 6),
    (NEW.id, 'Back Matter', '#64748b', 7);

  INSERT INTO public.page_types (yearbook_id, name, position) VALUES
    (NEW.id, 'Cover', 1),
    (NEW.id, 'Title Page', 2),
    (NEW.id, 'Portrait Grid', 3),
    (NEW.id, 'Class Page', 4),
    (NEW.id, 'Candid Collage', 5),
    (NEW.id, 'Feature Spread', 6),
    (NEW.id, 'Ad Page', 7),
    (NEW.id, 'Index', 8);

  INSERT INTO public.page_statuses (yearbook_id, name, color, position, is_terminal) VALUES
    (NEW.id, 'Planned', '#94a3b8', 1, false),
    (NEW.id, 'Assets Pending', '#f59e0b', 2, false),
    (NEW.id, 'In Design', '#3b82f6', 3, false),
    (NEW.id, 'Design Complete', '#6366f1', 4, false),
    (NEW.id, 'In Proofing', '#a855f7', 5, false),
    (NEW.id, 'Corrections', '#ef4444', 6, false),
    (NEW.id, 'Approved', '#22c55e', 7, false),
    (NEW.id, 'Submitted to Service Bureau', '#0f766e', 8, true);

  RETURN NEW;
END; $$;
CREATE TRIGGER on_yearbook_created AFTER INSERT ON public.yearbooks FOR EACH ROW EXECUTE FUNCTION public.handle_new_yearbook();

CREATE INDEX idx_pages_yearbook ON public.pages(yearbook_id, position);
CREATE INDEX idx_members_user ON public.yearbook_members(user_id);
CREATE INDEX idx_students_yearbook ON public.students(yearbook_id);
CREATE INDEX idx_assignments_page ON public.page_assignments(page_id);