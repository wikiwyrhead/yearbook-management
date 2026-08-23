/**
 * Phase 6 permission helpers. These reuse the Phase 1-5 security-definer
 * functions rather than re-implementing role logic.
 */
type Sb = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

async function check(supabase: Sb, fn: string, args: Record<string, unknown>): Promise<boolean> {
  const { data } = await supabase.rpc(fn, args);
  return data === true;
}

export async function requireSuperAdmin(supabase: Sb, userId: string): Promise<void> {
  if (!(await check(supabase, "is_super_admin", { _user_id: userId }))) {
    throw new Error("Only a Super Admin can manage organization storage providers.");
  }
}

export async function requireCenterManager(
  supabase: Sb,
  userId: string,
  centerId: string,
): Promise<void> {
  const isSuper = await check(supabase, "is_super_admin", { _user_id: userId });
  if (isSuper) return;
  const isCoord = await check(supabase, "is_center_coordinator", {
    _user_id: userId,
    _school_id: centerId,
  });
  if (!isCoord) {
    throw new Error("Only a Super Admin or Center Coordinator can manage storage for this Center.");
  }
}

export async function requireYearbookMember(
  supabase: Sb,
  userId: string,
  yearbookId: string,
): Promise<void> {
  if (
    !(await check(supabase, "is_yearbook_member", { _user_id: userId, _yearbook_id: yearbookId }))
  ) {
    throw new Error("You do not have access to this yearbook.");
  }
}

export async function requireYearbookCoordinator(
  supabase: Sb,
  userId: string,
  yearbookId: string,
): Promise<void> {
  if (
    !(await check(supabase, "can_manage_yearbook", { _user_id: userId, _yearbook_id: yearbookId }))
  ) {
    throw new Error("Only a Coordinator can change this yearbook's storage configuration.");
  }
}

export async function requireYearbookEditor(
  supabase: Sb,
  userId: string,
  yearbookId: string,
): Promise<void> {
  if (
    !(await check(supabase, "can_edit_yearbook", { _user_id: userId, _yearbook_id: yearbookId }))
  ) {
    throw new Error("You do not have permission to import assets into this yearbook.");
  }
}

/** Students may import only against their own student record. */
export async function assertImportAllowed(
  supabase: Sb,
  userId: string,
  yearbookId: string,
  studentId?: string | undefined,
): Promise<void> {
  const isStaff = await check(supabase, "is_yearbook_staff_member", {
    _user_id: userId,
    _yearbook_id: yearbookId,
  });
  if (isStaff) return;
  if (!studentId) {
    throw new Error("You do not have permission to import assets into this yearbook.");
  }
  await requireYearbookMember(supabase, userId, yearbookId);
}
