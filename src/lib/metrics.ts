/**
 * All dashboard and report numbers are derived here from the stored
 * applications, submissions and offers — nothing is hard-coded.
 *
 * Definitions
 *  - Total applications: non-archived applications matching the filters (incl. drafts).
 *  - Pending approvals: Submitted, Under Review or Conditionally Approved.
 *  - Approved: Approved, Offer Accepted, Contracting or Funded (reached approval).
 *  - Approval rate: approved ÷ (approved + declined). Undefined until a decision exists.
 *  - Financing volume: requested financing of non-draft applications, in
 *    USD-equivalent using the fixed demo FX rate (CAD amounts ÷ 1.36).
 *  - Funded volume: funded amount of Funded deals, USD-equivalent.
 */
import { USD_TO_CAD } from "@/data/reference";
import { APPROVED_STATUSES, PENDING_STATUSES } from "@/domain/status";
import type {
  AppData,
  Country,
  Currency,
  CustomerType,
  FinancingApplication,
  FinancingType,
  LenderSubmission,
} from "@/domain/types";
import { monthKey, monthLabel } from "./format";

export type DateRange = "all" | "30d" | "90d" | "6m" | "12m" | "ytd";

export interface MetricFilters {
  range: DateRange;
  country: "all" | Country;
  financingType: "all" | FinancingType;
  employeeId: "all" | string;
  customerType: "all" | CustomerType;
  lenderId: "all" | string;
}

export const DEFAULT_FILTERS: MetricFilters = {
  range: "12m",
  country: "all",
  financingType: "all",
  employeeId: "all",
  customerType: "all",
  lenderId: "all",
};

export const RANGE_LABEL: Record<DateRange, string> = {
  all: "All time",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  "6m": "Last 6 months",
  "12m": "Last 12 months",
  ytd: "Year to date",
};

export const toUsd = (amount: number, currency: Currency): number =>
  currency === "CAD" ? amount / USD_TO_CAD : amount;

export function rangeStart(range: DateRange, now: Date): Date | null {
  const d = new Date(now);
  switch (range) {
    case "all":
      return null;
    case "30d":
      d.setDate(d.getDate() - 30);
      return d;
    case "90d":
      d.setDate(d.getDate() - 90);
      return d;
    case "6m":
      d.setMonth(d.getMonth() - 6);
      return d;
    case "12m":
      d.setMonth(d.getMonth() - 12);
      return d;
    case "ytd":
      return new Date(now.getFullYear(), 0, 1);
  }
}

export function filterApplications(data: AppData, f: MetricFilters, now: Date = new Date()): FinancingApplication[] {
  const start = rangeStart(f.range, now);
  const customers = new Map(data.customers.map((c) => [c.id, c]));
  const lenderApps = f.lenderId === "all" ? null : new Set(data.submissions.filter((s) => s.lenderId === f.lenderId).map((s) => s.applicationId));
  return data.applications.filter((a) => {
    if (a.archived) return false;
    if (start && new Date(a.createdAt) < start) return false;
    if (f.country !== "all" && a.country !== f.country) return false;
    if (f.financingType !== "all" && a.financingType !== f.financingType) return false;
    if (f.employeeId !== "all" && a.assignedEmployeeId !== f.employeeId) return false;
    if (f.customerType !== "all" && customers.get(a.customerId)?.type !== f.customerType) return false;
    if (lenderApps && !lenderApps.has(a.id)) return false;
    return true;
  });
}

export interface Kpis {
  total: number;
  pending: number;
  approved: number;
  declined: number;
  funded: number;
  volumeUsd: number;
  fundedVolumeUsd: number;
  approvalRate: number | null;
  fundingConversion: number | null;
  avgFinancingUsd: number | null;
}

export function computeKpis(apps: FinancingApplication[]): Kpis {
  const submitted = apps.filter((a) => a.status !== "draft");
  const approved = apps.filter((a) => APPROVED_STATUSES.includes(a.status)).length;
  const declined = apps.filter((a) => a.status === "declined").length;
  const funded = apps.filter((a) => a.status === "funded");
  const volumeUsd = submitted.reduce((s, a) => s + toUsd(a.requestedAmount, a.currency), 0);
  const fundedVolumeUsd = funded.reduce((s, a) => s + toUsd(a.fundedAmount ?? a.requestedAmount, a.currency), 0);
  const decided = approved + declined;
  return {
    total: apps.length,
    pending: apps.filter((a) => PENDING_STATUSES.includes(a.status)).length,
    approved,
    declined,
    funded: funded.length,
    volumeUsd,
    fundedVolumeUsd,
    approvalRate: decided ? approved / decided : null,
    fundingConversion: approved ? funded.length / approved : null,
    avgFinancingUsd: submitted.length ? volumeUsd / submitted.length : null,
  };
}

export function lastMonths(count: number, now: Date = new Date()): string[] {
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    keys.push(d.toISOString().slice(0, 7));
  }
  return keys;
}

export interface MonthPoint {
  key: string;
  label: string;
  applications: number;
  approved: number;
  declined: number;
  requestedVolume: number;
  fundedVolume: number;
}

export function monthlySeries(apps: FinancingApplication[], months: number, now: Date = new Date()): MonthPoint[] {
  const keys = lastMonths(months, now);
  const points = new Map<string, MonthPoint>(
    keys.map((k) => [k, { key: k, label: monthLabel(k), applications: 0, approved: 0, declined: 0, requestedVolume: 0, fundedVolume: 0 }]),
  );
  for (const a of apps) {
    const p = points.get(monthKey(a.createdAt));
    if (p) {
      p.applications += 1;
      if (a.status !== "draft") p.requestedVolume += toUsd(a.requestedAmount, a.currency);
      if (APPROVED_STATUSES.includes(a.status)) p.approved += 1;
      if (a.status === "declined") p.declined += 1;
    }
    if (a.status === "funded" && a.fundedAt) {
      const fp = points.get(monthKey(a.fundedAt));
      if (fp) fp.fundedVolume += toUsd(a.fundedAmount ?? a.requestedAmount, a.currency);
    }
  }
  return keys.map((k) => points.get(k)!);
}

export interface LenderStat {
  lenderId: string;
  name: string;
  submissions: number;
  approved: number;
  conditional: number;
  declined: number;
  pending: number;
  approvalRate: number | null;
  avgTurnaroundDays: number | null;
  fundedDeals: number;
  fundedVolumeUsd: number;
}

export function lenderStats(data: AppData, apps: FinancingApplication[]): LenderStat[] {
  const appIds = new Map(apps.map((a) => [a.id, a]));
  const subs = data.submissions.filter((s) => appIds.has(s.applicationId));
  return data.lenders
    .map((l) => {
      const mine = subs.filter((s) => s.lenderId === l.id);
      const approved = mine.filter((s) => s.status === "approved").length;
      const conditional = mine.filter((s) => s.status === "conditionally_approved").length;
      const declined = mine.filter((s) => s.status === "declined").length;
      const pending = mine.filter((s) => ["submitted", "under_review", "info_requested", "queued"].includes(s.status)).length;
      const decided = approved + conditional + declined;
      const turn = mine
        .filter((s) => s.submittedAt && s.decisionAt && s.status !== "withdrawn")
        .map((s) => (new Date(s.decisionAt!).getTime() - new Date(s.submittedAt!).getTime()) / 86_400_000);
      const funded = apps.filter((a) => {
        if (a.status !== "funded" || !a.acceptedOfferId) return false;
        return data.offers.find((o) => o.id === a.acceptedOfferId)?.lenderId === l.id;
      });
      return {
        lenderId: l.id,
        name: l.name,
        submissions: mine.length,
        approved,
        conditional,
        declined,
        pending,
        approvalRate: decided ? (approved + conditional) / decided : null,
        avgTurnaroundDays: turn.length ? turn.reduce((s, x) => s + x, 0) / turn.length : null,
        fundedDeals: funded.length,
        fundedVolumeUsd: funded.reduce((s, a) => s + toUsd(a.fundedAmount ?? a.requestedAmount, a.currency), 0),
      };
    })
    .filter((s) => s.submissions > 0);
}

export interface EmployeeStat {
  employeeId: string;
  name: string;
  applications: number;
  submitted: number;
  approved: number;
  funded: number;
  fundedVolumeUsd: number;
  approvalRate: number | null;
}

export function employeeStats(data: AppData, apps: FinancingApplication[]): EmployeeStat[] {
  return data.employees
    .map((e) => {
      const mine = apps.filter((a) => a.assignedEmployeeId === e.id);
      const k = computeKpis(mine);
      return {
        employeeId: e.id,
        name: e.name,
        applications: mine.length,
        submitted: mine.filter((a) => a.status !== "draft" && a.status !== "needs_documents" && a.status !== "ready_to_submit").length,
        approved: k.approved,
        funded: k.funded,
        fundedVolumeUsd: k.fundedVolumeUsd,
        approvalRate: k.approvalRate,
      };
    })
    .filter((s) => s.applications > 0);
}

export interface ProductStat {
  type: FinancingType;
  applications: number;
  approved: number;
  declined: number;
  funded: number;
  approvalRate: number | null;
  volumeUsd: number;
  avgUsd: number | null;
}

export function productStats(apps: FinancingApplication[]): ProductStat[] {
  return (["loan", "lease"] as const).map((type) => {
    const mine = apps.filter((a) => a.financingType === type);
    const k = computeKpis(mine);
    return {
      type,
      applications: mine.length,
      approved: k.approved,
      declined: k.declined,
      funded: k.funded,
      approvalRate: k.approvalRate,
      volumeUsd: k.volumeUsd,
      avgUsd: k.avgFinancingUsd,
    };
  });
}

export function submissionsForApps(data: AppData, apps: FinancingApplication[]): LenderSubmission[] {
  const ids = new Set(apps.map((a) => a.id));
  return data.submissions.filter((s) => ids.has(s.applicationId));
}

/* ------------------------------ CSV ------------------------------ */

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(esc).join(",")).join("\r\n");
}

export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const blob = new Blob([`\uFEFF${toCsv(rows)}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
