/**
 * Centralized Production Editorial & Platform Wording
 * Clean, production-appropriate copy for K-12 school publishing.
 */

export const APP_NAME = "Milestone Yearbook";
export const APP_SUBTITLE = "Production Studio";

export const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Administrator",
  coordinator: "Yearbook Coordinator",
  advisor: "Faculty Advisor",
  editorial_member: "Editorial Team Member",
  staff: "Staff Member",
  member: "Team Member",
  student: "Student Contributor",
  student_contributor: "Student Contributor",
  proofreader: "Proofreader",
  corrector: "Corrector",
};

export const STATUS_LABELS: Record<string, { label: string; description: string }> = {
  draft: { label: "Draft", description: "Initial composition in progress" },
  in_progress: { label: "In Progress", description: "Active editing underway" },
  ready: { label: "Ready for Review", description: "Submitted for editorial proofreading" },
  approved: { label: "Approved", description: "Signed off by coordinator" },
  locked: { label: "Locked for Press", description: "Finalized for print manufacturing" },
  completed: { label: "Completed", description: "Workflow stage finished" },
  needs_attention: { label: "Needs Attention", description: "Action required on feedback" },
};

export const EMPTY_STATES = {
  noYearbooks: "No yearbooks available for your assigned center.",
  noAssignedPages: "No layout pages are currently assigned to your account.",
  noAssets: "No photographic assets uploaded yet.",
  noProofs: "No digital proofs generated yet for this edition.",
  noCorrections: "No correction pins or annotations recorded for this spread.",
  noStudents: "No student records found for this graduation class.",
  noEditorialTeam: "No editorial team members assigned yet.",
};

export const OPERATING_MODE_COPY = {
  singleCenterTitle: "Single-Center Operating Mode",
  singleCenterDescription:
    "The platform operates exclusively for the selected Primary Center. Secondary centers remain safely preserved in the database and are not accessible during standard operations.",
  multiCenterTitle: "Multiple-Center Operating Mode",
  multiCenterDescription:
    "Standard operational mode with multi-center appointments, cross-center isolation, and multi-school yearbook management.",
  confirmSingleCenter:
    "Are you sure you want to switch to Single-Center mode? Normal operational screens will only display the selected Primary Center. Secondary centers remain intact in the database.",
  confirmMultiCenter:
    "Are you sure you want to restore Multiple-Center mode? All secondary centers and multi-center workspaces will immediately become active again.",
};
