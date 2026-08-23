import React, { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getYearbookTeam,
  getCenterEligibleStudents,
  coordinatorAssignStudentEditor,
  coordinatorRemoveStudentEditor,
  coordinatorAssignEditorialPages,
  adminAssignYearbookRole,
  adminAssignYearbookPages,
} from "@/lib/yearbook.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Users,
  Shield,
  UserPlus,
  BookOpen,
  Layers,
  FileText,
  Trash2,
  CheckCircle,
  AlertCircle,
  Clock,
  Sparkles,
} from "lucide-react";

function formatDate(val: any): string {
  if (!val) return "";
  if (val instanceof Date) return val.toISOString().split("T")[0]!;
  if (typeof val === "string") return val.split("T")[0]!;
  return String(val);
}

interface EditorialTeamTabProps {
  yearbookId: string;
  isSuperAdmin: boolean;
  canManage: boolean;
  pages: Array<{ id: string; page_number: number; title: string | null }>;
  sections: Array<{ id: string; name: string; color: string | null }>;
}

export function EditorialTeamTab({
  yearbookId,
  isSuperAdmin,
  canManage,
  pages,
  sections,
}: EditorialTeamTabProps) {
  const fetchTeamFn = useServerFn(getYearbookTeam);
  const fetchEligibleFn = useServerFn(getCenterEligibleStudents);
  const assignStudentEditorFn = useServerFn(coordinatorAssignStudentEditor);
  const removeStudentEditorFn = useServerFn(coordinatorRemoveStudentEditor);
  const assignEditorialPagesFn = useServerFn(coordinatorAssignEditorialPages);
  const adminAssignRoleFn = useServerFn(adminAssignYearbookRole);
  const adminAssignPagesFn = useServerFn(adminAssignYearbookPages);

  const [loading, setLoading] = useState(true);
  const [teamData, setTeamData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Coordinator Add Student Modal
  const [openStudentModal, setOpenStudentModal] = useState(false);
  const [eligibleStudents, setEligibleStudents] = useState<any[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]!);
  const [endDate, setEndDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Super Admin Add Member Modal
  const [openAdminModal, setOpenAdminModal] = useState(false);
  const [adminTargetUserId, setAdminTargetUserId] = useState("");
  const [adminRole, setAdminRole] = useState<
    "advisor" | "editorial_member" | "student_contributor"
  >("editorial_member");

  // Page / Section Assignment Modal
  const [openPageModal, setOpenPageModal] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<any>(null);
  const [selectedPageIds, setSelectedPageIds] = useState<string[]>([]);
  const [selectedSectionIds, setSelectedSectionIds] = useState<string[]>([]);

  async function loadTeam() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchTeamFn({ data: { yearbookId } });
      setTeamData(res);
    } catch (err: any) {
      setError(err.message || "Failed to load team data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTeam();
  }, [yearbookId]);

  async function handleOpenStudentModal() {
    try {
      const students = await fetchEligibleFn({ data: { yearbookId } });
      setEligibleStudents(students);
      if (students.length > 0) {
        setSelectedStudentId(students[0]!.user_id);
      }
      setOpenStudentModal(true);
    } catch (err: any) {
      alert(err.message || "Failed to fetch eligible students");
    }
  }

  async function handleAssignStudentEditor(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedStudentId) return;
    setSubmitting(true);
    try {
      await assignStudentEditorFn({
        data: {
          yearbookId,
          studentUserId: selectedStudentId,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        },
      });
      setOpenStudentModal(false);
      await loadTeam();
    } catch (err: any) {
      alert(err.message || "Failed to assign student editor");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSuperAdminAssignMember(e: React.FormEvent) {
    e.preventDefault();
    if (!adminTargetUserId) return;
    setSubmitting(true);
    try {
      await adminAssignRoleFn({
        data: {
          yearbookId,
          userId: adminTargetUserId,
          role: adminRole,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        },
      });
      setOpenAdminModal(false);
      await loadTeam();
    } catch (err: any) {
      alert(err.message || "Failed to assign role");
    } finally {
      setSubmitting(false);
    }
  }

  function handleOpenAssignPages(assignment: any) {
    setSelectedAssignment(assignment);
    setSelectedPageIds(assignment.assigned_pages?.map((p: any) => p.page_id) ?? []);
    setSelectedSectionIds(assignment.assigned_sections?.map((s: any) => s.section_id) ?? []);
    setOpenPageModal(true);
  }

  async function handleSavePageAssignments() {
    if (!selectedAssignment) return;
    setSubmitting(true);
    try {
      if (isSuperAdmin) {
        await adminAssignPagesFn({
          data: {
            assignmentId: selectedAssignment.id,
            pageIds: selectedPageIds,
            sectionIds: selectedSectionIds,
          },
        });
      } else {
        await assignEditorialPagesFn({
          data: {
            assignmentId: selectedAssignment.id,
            pageIds: selectedPageIds,
            sectionIds: selectedSectionIds,
          },
        });
      }
      setOpenPageModal(false);
      await loadTeam();
    } catch (err: any) {
      alert(err.message || "Failed to save page assignments");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeactivateAssignment(assignmentId: string, role?: string) {
    if (!confirm("Are you sure you want to deactivate this team assignment?")) return;
    try {
      await removeStudentEditorFn({ data: { assignmentId } });
      await loadTeam();
    } catch (err: any) {
      alert(err.message || "Failed to remove assignment");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Clock className="w-5 h-5 animate-spin mr-2" />
        <span>Loading Editorial Team...</span>
      </div>
    );
  }

  const isCoord = teamData?.isCoordinator || isSuperAdmin;
  const assignments: any[] = teamData?.assignments ?? [];
  const coordinators: any[] = teamData?.coordinators ?? [];

  return (
    <div className="space-y-6">
      {/* Header & Role Delegation Action */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-6 bg-card border border-border rounded-xl shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              Editorial Team &amp; Assignments
            </h2>
            <span className="text-xs px-2.5 py-0.5 rounded-full font-medium bg-primary/10 text-primary border border-primary/20">
              Annual Cycle
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Annual team responsible for this specific yearbook cycle. Student editorial assignments
            grant page-scoped drafting and proof commenting.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {isSuperAdmin && (
            <Button
              onClick={() => setOpenAdminModal(true)}
              variant="outline"
              className="border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10"
            >
              <Shield className="w-4 h-4 mr-2" />
              Admin: Assign Role
            </Button>
          )}

          {isCoord && (
            <Button
              onClick={handleOpenStudentModal}
              className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Add Student to Editorial Team
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-xl text-destructive text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Center Coordinator Banner */}
      {coordinators.length > 0 && (
        <div className="p-4 bg-muted/50 border border-border rounded-xl">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-primary" />
            Center Leadership
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {coordinators.map((c: any) => (
              <div
                key={c.id}
                className="flex items-center gap-3 p-3 bg-card border border-border rounded-lg shadow-sm"
              >
                <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold text-sm border border-primary/20">
                  {c.profile?.full_name ? c.profile.full_name.charAt(0) : "C"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-foreground truncate">
                    {c.profile?.full_name || c.profile?.email || "Coordinator"}
                  </div>
                  <div className="text-xs text-primary/80">
                    Center Coordinator ({c.is_active ? "Active" : "Inactive"})
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Team Assignments Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-foreground">
            <thead className="bg-muted/60 text-xs font-semibold uppercase text-muted-foreground border-b border-border">
              <tr>
                <th className="py-3 px-4">Person</th>
                <th className="py-3 px-4">Center Base</th>
                <th className="py-3 px-4">Yearbook Role</th>
                <th className="py-3 px-4">Assigned Scope</th>
                <th className="py-3 px-4">Active Dates</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Assigned By</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {assignments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-muted-foreground">
                    <BookOpen className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                    No annual team members assigned yet.
                    {isCoord && (
                      <div className="mt-2">
                        <Button
                          onClick={handleOpenStudentModal}
                          variant="link"
                          className="text-primary hover:text-primary/80 text-xs"
                        >
                          Add a Student to the Editorial Team &rarr;
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ) : (
                assignments.map((a: any) => {
                  const isEditor = a.role === "editorial_member";
                  const isAdvisor = a.role === "advisor";
                  const isContributor = a.role === "student_contributor";
                  const canEditThisRow = isSuperAdmin || (isCoord && isEditor);

                  const today = new Date().toISOString().split("T")[0]!;
                  const startStr = formatDate(a.start_date);
                  const endStr = formatDate(a.end_date);
                  const isExpired = !!(endStr && endStr < today);
                  const isFuture = !!(startStr && startStr > today);
                  const isActive = a.is_active && !isExpired && !isFuture;

                  return (
                    <tr key={a.id} className="hover:bg-muted/40 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/10 text-primary border border-primary/20 flex items-center justify-center font-medium text-xs">
                            {a.profile?.full_name ? a.profile.full_name.charAt(0) : "U"}
                          </div>
                          <div>
                            <div className="font-medium text-foreground">
                              {a.profile?.full_name || "Unknown User"}
                            </div>
                            <div className="text-xs text-muted-foreground">{a.profile?.email}</div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <span className="text-xs px-2 py-0.5 rounded capitalize bg-muted text-foreground border border-border">
                          {a.center_membership?.member_type || "Student"}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        {isAdvisor && (
                          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200 dark:bg-purple-500/10 dark:text-purple-300 dark:border-purple-500/20">
                            Advisor
                          </span>
                        )}
                        {isEditor && (
                          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20">
                            Editorial Member
                          </span>
                        )}
                        {isContributor && (
                          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20">
                            Student Contributor
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {(a.assigned_pages ?? []).length === 0 &&
                            (a.assigned_sections ?? []).length === 0 && (
                              <span className="text-xs text-muted-foreground">All / Unrestricted</span>
                            )}
                          {(a.assigned_pages ?? []).map((p: any) => (
                            <span
                              key={p.page_id}
                              className="text-[11px] px-1.5 py-0.5 bg-primary/10 text-primary rounded border border-primary/20"
                            >
                              Page {p.page_number || p.title || p.page_id.slice(0, 4)}
                            </span>
                          ))}
                          {(a.assigned_sections ?? []).map((s: any) => (
                            <span
                              key={s.section_id}
                              className="text-[11px] px-1.5 py-0.5 bg-purple-100 text-purple-800 rounded border border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800/40"
                            >
                              {s.name || "Section"}
                            </span>
                          ))}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-xs text-muted-foreground">
                        {startStr || "Cycle Start"} &rarr; {endStr || "Open"}
                      </td>

                      <td className="py-3 px-4">
                        {isActive ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-200 dark:text-emerald-400 dark:bg-emerald-500/10 dark:border-emerald-500/20">
                            <CheckCircle className="w-3 h-3" /> Active
                          </span>
                        ) : isExpired ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-200 dark:text-amber-400 dark:bg-amber-500/10 dark:border-amber-500/20">
                            <Clock className="w-3 h-3" /> Expired
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full border border-border">
                            Inactive
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-xs text-muted-foreground">
                        {a.assigned_by_profile?.full_name || "Super Admin"}
                      </td>

                      <td className="py-3 px-4 text-right">
                        {canEditThisRow ? (
                          <div className="flex items-center justify-end gap-2">
                            {(isEditor || isAdvisor) && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleOpenAssignPages(a)}
                                className="h-7 text-xs"
                              >
                                <FileText className="w-3 h-3 mr-1" />
                                Assign Pages
                              </Button>
                            )}

                            {a.is_active && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDeactivateAssignment(a.id, a.role)}
                                className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground/50 italic">Read-only</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Coordinator Add Student to Editorial Team Modal */}
      <Dialog open={openStudentModal} onOpenChange={setOpenStudentModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary">
              <Sparkles className="w-5 h-5" />
              Add Student to Editorial Team
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleAssignStudentEditor} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">
                Select Active Center Student
              </label>
              {eligibleStudents.length === 0 ? (
                <div className="p-3 bg-muted border border-border rounded-lg text-xs text-muted-foreground">
                  No unassigned active Students found in this Center.
                </div>
              ) : (
                <select
                  value={selectedStudentId}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                  className="w-full bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                >
                  {eligibleStudents.map((s: any) => (
                    <option key={s.user_id} value={s.user_id}>
                      {s.profile?.full_name || s.profile?.email} ({s.profile?.email})
                    </option>
                  ))}
                </select>
              )}
              <p className="text-[11px] text-muted-foreground mt-1">
                Role will strictly be set to <strong>Editorial Member</strong>. Access lasts for
                this yearbook cycle only.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Start Date
                </label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  End Date (Optional)
                </label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="text-sm"
                />
              </div>
            </div>

            <DialogFooter className="pt-3">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpenStudentModal(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting || eligibleStudents.length === 0}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                {submitting ? "Assigning..." : "Assign to Team"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Super Admin Assign Role Modal */}
      <Dialog open={openAdminModal} onOpenChange={setOpenAdminModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <Shield className="w-5 h-5" />
              Admin: Assign Yearbook Role
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSuperAdminAssignMember} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">
                User ID
              </label>
              <Input
                placeholder="Enter user UUID"
                value={adminTargetUserId}
                onChange={(e) => setAdminTargetUserId(e.target.value)}
                className="text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">
                Role
              </label>
              <select
                value={adminRole}
                onChange={(e) => setAdminRole(e.target.value as any)}
                className="w-full bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="advisor">Advisor</option>
                <option value="editorial_member">Editorial Member</option>
                <option value="student_contributor">Student Contributor</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Start Date</label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">End Date (Optional)</label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="text-sm" />
              </div>
            </div>
            <DialogFooter className="pt-3">
              <Button type="button" variant="ghost" onClick={() => setOpenAdminModal(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting || !adminTargetUserId}
                className="bg-amber-600 hover:bg-amber-500 text-white"
              >
                {submitting ? "Assigning..." : "Assign Role"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Assign Pages & Sections Modal */}
      <Dialog open={openPageModal} onOpenChange={setOpenPageModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary">
              <Layers className="w-5 h-5" />
              Assign Pages &amp; Sections
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-2">
                Assigned Pages ({selectedPageIds.length} selected)
              </label>
              <div className="max-h-48 overflow-y-auto p-2 bg-muted/50 border border-border rounded-lg grid grid-cols-3 gap-2">
                {pages.map((p) => {
                  const isSelected = selectedPageIds.includes(p.id);
                  return (
                    <button
                      type="button"
                      key={p.id}
                      onClick={() => {
                        setSelectedPageIds((prev) =>
                          isSelected ? prev.filter((id) => id !== p.id) : [...prev, p.id],
                        );
                      }}
                      className={`px-2 py-1.5 text-xs rounded font-medium border text-left flex items-center justify-between transition-colors ${
                        isSelected
                          ? "bg-primary/15 border-primary text-primary"
                          : "bg-card border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      <span>Page {p.page_number}</span>
                      {isSelected && <CheckCircle className="w-3 h-3 text-primary" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {sections.length > 0 && (
              <div>
                <label className="block text-xs font-semibold text-foreground mb-2">
                  Assigned Sections ({selectedSectionIds.length} selected)
                </label>
                <div className="max-h-36 overflow-y-auto p-2 bg-muted/50 border border-border rounded-lg flex flex-wrap gap-2">
                  {sections.map((s) => {
                    const isSelected = selectedSectionIds.includes(s.id);
                    return (
                      <button
                        type="button"
                        key={s.id}
                        onClick={() => {
                          setSelectedSectionIds((prev) =>
                            isSelected ? prev.filter((id) => id !== s.id) : [...prev, s.id],
                          );
                        }}
                        className={`px-2.5 py-1 text-xs rounded font-medium border transition-colors ${
                          isSelected
                            ? "bg-purple-100 border-purple-400 text-purple-800 dark:bg-purple-600/20 dark:border-purple-500 dark:text-purple-300"
                            : "bg-card border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                      >
                        {s.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="pt-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpenPageModal(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={submitting}
              onClick={handleSavePageAssignments}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {submitting ? "Saving..." : "Save Scope"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
