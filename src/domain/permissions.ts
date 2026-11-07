import type { Role } from "./types";

/**
 * UI-ONLY role simulation. These checks hide or disable controls to
 * demonstrate role differences. They are NOT authorization. In production,
 * every permission must be enforced server-side (e.g. Supabase RLS / policies).
 */
export type Permission =
  | "application.create"
  | "application.edit"
  | "application.archive"
  | "application.status"
  | "application.fund"
  | "submission.manage"
  | "offer.manage"
  | "lender.manage"
  | "commission.viewAll"
  | "commission.manage"
  | "report.export"
  | "settings.manage"
  | "demo.reset";

const ALL: Permission[] = [
  "application.create",
  "application.edit",
  "application.archive",
  "application.status",
  "application.fund",
  "submission.manage",
  "offer.manage",
  "lender.manage",
  "commission.viewAll",
  "commission.manage",
  "report.export",
  "settings.manage",
  "demo.reset",
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  administrator: ALL,
  finance_manager: ALL.filter((p) => p !== "settings.manage" && p !== "demo.reset"),
  sales_rep: ["application.create", "application.edit", "offer.manage"],
};

export const PERMISSION_LABEL: Record<Permission, string> = {
  "application.create": "Create applications",
  "application.edit": "Edit applications",
  "application.archive": "Archive applications",
  "application.status": "Change application status",
  "application.fund": "Mark deals funded",
  "submission.manage": "Submit to lenders & record decisions",
  "offer.manage": "Add and edit offers",
  "lender.manage": "Manage lenders & programs",
  "commission.viewAll": "View all commissions",
  "commission.manage": "Edit commission payment status",
  "report.export": "Export reports",
  "settings.manage": "Change settings",
  "demo.reset": "Reset demo data",
};

export function hasPermission(role: Role, p: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(p);
}
