async function check(supabase, fn, args) {
    const { data } = await supabase.rpc(fn, args);
    return data === true;
}
export async function requireSuperAdmin(supabase, userId) {
    if (!(await check(supabase, "is_super_admin", { _user_id: userId }))) {
        throw new Error("Only a Super Admin can manage organization storage providers.");
    }
}
export async function requireYearbookMember(supabase, userId, yearbookId) {
    if (!(await check(supabase, "is_yearbook_member", { _user_id: userId, _yearbook_id: yearbookId }))) {
        throw new Error("You do not have access to this yearbook.");
    }
}
export async function requireYearbookCoordinator(supabase, userId, yearbookId) {
    if (!(await check(supabase, "can_manage_yearbook", { _user_id: userId, _yearbook_id: yearbookId }))) {
        throw new Error("Only a Coordinator can change this yearbook's storage configuration.");
    }
}
export async function requireYearbookEditor(supabase, userId, yearbookId) {
    if (!(await check(supabase, "can_edit_yearbook", { _user_id: userId, _yearbook_id: yearbookId }))) {
        throw new Error("You do not have permission to import assets into this yearbook.");
    }
}
/** Students may import only against their own student record. */
export async function assertImportAllowed(supabase, userId, yearbookId, studentId) {
    const isStaff = await check(supabase, "is_yearbook_staff_member", {
        _user_id: userId,
        _yearbook_id: yearbookId,
    });
    if (isStaff)
        return;
    if (!studentId) {
        throw new Error("You do not have permission to import assets into this yearbook.");
    }
    await requireYearbookMember(supabase, userId, yearbookId);
}
