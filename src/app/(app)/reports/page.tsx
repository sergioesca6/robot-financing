"use client";

import { useMemo, useState } from "react";
import { Download, FileBarChart } from "lucide-react";
import { MetricFilterBar } from "@/components/shared/metric-filters";
import { Callout, EmptyState, PageHeader, SectionCard } from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FINANCING_TYPE_LABEL } from "@/domain/labels";
import { APPLICATION_STATUS_META, APPLICATION_STATUS_ORDER, PENDING_STATUSES } from "@/domain/status";
import { daysBetween, formatDate, formatMoney, formatPercent } from "@/lib/format";
import { DEFAULT_FILTERS, downloadCsv, employeeStats, filterApplications, lenderStats, productStats, RANGE_LABEL, toUsd, type MetricFilters } from "@/lib/metrics";
import { customerDisplayName, documentCompleteness, robotLabel } from "@/lib/selectors";
import { useStore } from "@/store/store";

type Kind = "text" | "num" | "usd" | "pct" | "date" | "days";
interface Col { label: string; kind: Kind }
interface Report { columns: Col[]; rows: (string | number | null)[][]; note?: string }

const REPORTS = [
  { id: "status", label: "Applications by status", description: "Pipeline snapshot and requested volume." },
  { id: "lenders", label: "Lender performance", description: "Decisions, approval rate, turnaround and funded volume." },
  { id: "product", label: "Loan vs lease", description: "Volume and outcomes by financing structure." },
  { id: "employees", label: "Employee production", description: "Applications, approvals and funded volume by owner." },
  { id: "pending", label: "Pending applications", description: "Open lender decisions and how long they've waited." },
  { id: "funded", label: "Funded deals", description: "Closed-won deals with time to fund." },
  { id: "commissions", label: "Commission totals", description: "Estimated, pending and paid by employee and lender." },
  { id: "documents", label: "Document completeness", description: "Applications still missing required documents." },
  { id: "offers", label: "Offers by lender", description: "Offer outcomes and average terms." },
] as const;

export default function ReportsPage() {
  const { data, can } = useStore();
  const [filters, setFilters] = useState<MetricFilters>(DEFAULT_FILTERS);
  const [reportId, setReportId] = useState<(typeof REPORTS)[number]["id"]>("status");

  const apps = useMemo(() => filterApplications(data, filters), [data, filters]);

  const report: Report = useMemo(() => {
    const cust = (id: string) => customerDisplayName(data.customers.find((c) => c.id === id));
    const emp = (id?: string) => data.employees.find((e) => e.id === id)?.name ?? "—";
    const lend = (id: string) => data.lenders.find((l) => l.id === id)?.name ?? "—";
    const daysSince = (iso: string) => Math.max(0, daysBetween(iso, new Date()));
    switch (reportId) {
      case "status": {
        const total = apps.length || 1;
        return {
          columns: [{ label: "Status", kind: "text" }, { label: "Applications", kind: "num" }, { label: "Share", kind: "pct" }, { label: "Requested (USD eq.)", kind: "usd" }],
          rows: APPLICATION_STATUS_ORDER.map((s) => {
            const m = apps.filter((a) => a.status === s);
            return [APPLICATION_STATUS_META[s].label, m.length, m.length / total, m.reduce((t, a) => t + toUsd(a.requestedAmount, a.currency), 0)];
          }),
        };
      }
      case "lenders": {
        return {
          columns: [{ label: "Lender", kind: "text" }, { label: "Submissions", kind: "num" }, { label: "Approved", kind: "num" }, { label: "Conditional", kind: "num" }, { label: "Declined", kind: "num" }, { label: "Pending", kind: "num" }, { label: "Approval rate", kind: "pct" }, { label: "Avg turnaround", kind: "days" }, { label: "Funded deals", kind: "num" }, { label: "Funded (USD eq.)", kind: "usd" }],
          rows: lenderStats(data, apps).filter((s) => s.submissions > 0).map((s) => [s.name, s.submissions, s.approved, s.conditional, s.declined, s.pending, s.approvalRate, s.avgTurnaroundDays, s.fundedDeals, s.fundedVolumeUsd]),
          note: "Approval rate = (approved + conditionally approved) ÷ decided submissions. Pending and withdrawn submissions are excluded.",
        };
      }
      case "product": {
        return {
          columns: [{ label: "Product", kind: "text" }, { label: "Applications", kind: "num" }, { label: "Approved", kind: "num" }, { label: "Declined", kind: "num" }, { label: "Funded", kind: "num" }, { label: "Approval rate", kind: "pct" }, { label: "Volume (USD eq.)", kind: "usd" }, { label: "Avg. request (USD eq.)", kind: "usd" }],
          rows: productStats(apps).map((p) => [FINANCING_TYPE_LABEL[p.type], p.applications, p.approved, p.declined, p.funded, p.approvalRate, p.volumeUsd, p.avgUsd]),
        };
      }
      case "employees": {
        return {
          columns: [{ label: "Employee", kind: "text" }, { label: "Applications", kind: "num" }, { label: "Submitted", kind: "num" }, { label: "Approved", kind: "num" }, { label: "Funded", kind: "num" }, { label: "Approval rate", kind: "pct" }, { label: "Funded (USD eq.)", kind: "usd" }],
          rows: employeeStats(data, apps).filter((e) => e.applications > 0).map((e) => [e.name, e.applications, e.submitted, e.approved, e.funded, e.approvalRate, e.fundedVolumeUsd]),
        };
      }
      case "pending": {
        return {
          columns: [{ label: "Application", kind: "text" }, { label: "Customer", kind: "text" }, { label: "Status", kind: "text" }, { label: "Requested (USD eq.)", kind: "usd" }, { label: "Open lender decisions", kind: "num" }, { label: "Days since activity", kind: "days" }, { label: "Owner", kind: "text" }],
          rows: apps
            .filter((a) => PENDING_STATUSES.includes(a.status))
            .map((a) => [a.id, cust(a.customerId), APPLICATION_STATUS_META[a.status].label, toUsd(a.requestedAmount, a.currency), data.submissions.filter((s) => s.applicationId === a.id && ["submitted", "under_review", "info_requested"].includes(s.status)).length, daysSince(a.lastActivityAt), emp(a.assignedEmployeeId)])
            .sort((x, y) => Number(y[5]) - Number(x[5])),
        };
      }
      case "funded": {
        return {
          columns: [{ label: "Application", kind: "text" }, { label: "Customer", kind: "text" }, { label: "Robot", kind: "text" }, { label: "Lender", kind: "text" }, { label: "Product", kind: "text" }, { label: "Funded (USD eq.)", kind: "usd" }, { label: "Funded on", kind: "date" }, { label: "Days to fund", kind: "days" }, { label: "Owner", kind: "text" }],
          rows: apps
            .filter((a) => a.status === "funded")
            .map((a) => {
              const offer = data.offers.find((o) => o.id === a.acceptedOfferId);
              const start = a.submittedAt ?? a.createdAt;
              return [a.id, cust(a.customerId), robotLabel(a), offer ? lend(offer.lenderId) : "—", FINANCING_TYPE_LABEL[a.financingType], toUsd(a.fundedAmount ?? a.requestedAmount, a.currency), a.fundedAt ?? null, a.fundedAt ? Math.round((new Date(a.fundedAt).getTime() - new Date(start).getTime()) / 86400000) : null, emp(a.assignedEmployeeId)];
            })
            .sort((x, y) => String(y[6]).localeCompare(String(x[6]))),
        };
      }
      case "commissions": {
        const ids = new Set(apps.map((a) => a.id));
        const rows = new Map<string, [string, string, number, number, number]>();
        data.commissions.filter((c) => ids.has(c.applicationId) && c.status !== "void").forEach((c) => {
          const who = c.kind === "salesperson" ? emp(c.employeeId) : lend(c.lenderId);
          const k = `${c.kind}|${who}`;
          const r = rows.get(k) ?? [who, c.kind === "salesperson" ? "Salesperson" : c.kind === "dealer_fee" ? "Dealer fee" : "Financing fee", 0, 0, 0];
          const v = toUsd(c.actual ?? c.estimated, c.currency);
          if (c.status === "estimated") r[2] += v;
          if (c.status === "pending") r[3] += v;
          if (c.status === "paid") r[4] += v;
          rows.set(k, r);
        });
        return {
          columns: [{ label: "Payee / source", kind: "text" }, { label: "Type", kind: "text" }, { label: "Estimated (USD eq.)", kind: "usd" }, { label: "Pending (USD eq.)", kind: "usd" }, { label: "Paid (USD eq.)", kind: "usd" }],
          rows: [...rows.values()].sort((a, b) => b[2] + b[3] + b[4] - (a[2] + a[3] + a[4])),
          note: "Commissions come from explicit rules (lender dealer fee, flat financing fee, salesperson %), not from interest earned.",
        };
      }
      case "documents": {
        return {
          columns: [{ label: "Application", kind: "text" }, { label: "Customer", kind: "text" }, { label: "Status", kind: "text" }, { label: "Received", kind: "text" }, { label: "Completeness", kind: "pct" }, { label: "Outstanding", kind: "text" }],
          rows: apps
            .filter((a) => !["funded", "closed", "declined"].includes(a.status))
            .map((a) => {
              const c = documentCompleteness(data.documents.filter((d) => d.applicationId === a.id));
              return [a.id, cust(a.customerId), APPLICATION_STATUS_META[a.status].label, `${c.received}/${c.required}`, c.percentReceived / 100, c.missing.map((m) => m.label).join("; ") || "None"] as (string | number | null)[];
            })
            .filter((r) => r[5] !== "None")
            .sort((x, y) => Number(x[4]) - Number(y[4])),
        };
      }
      case "offers": {
        const ids = new Set(apps.map((a) => a.id));
        const byLender = new Map<string, { active: number; accepted: number; rejected: number; other: number; apr: number[]; pay: number[] }>();
        data.offers.filter((o) => ids.has(o.applicationId)).forEach((o) => {
          const e = byLender.get(o.lenderId) ?? { active: 0, accepted: 0, rejected: 0, other: 0, apr: [], pay: [] };
          if (o.status === "active") e.active++; else if (o.status === "accepted") e.accepted++; else if (o.status === "rejected") e.rejected++; else e.other++;
          if (o.product === "loan" && o.apr !== undefined) e.apr.push(o.apr);
          e.pay.push(toUsd(o.monthlyPayment, apps.find((a) => a.id === o.applicationId)?.currency ?? "USD"));
          byLender.set(o.lenderId, e);
        });
        const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
        return {
          columns: [{ label: "Lender", kind: "text" }, { label: "Active", kind: "num" }, { label: "Accepted", kind: "num" }, { label: "Rejected", kind: "num" }, { label: "Draft / expired / superseded", kind: "num" }, { label: "Avg. loan APR", kind: "text" }, { label: "Avg. monthly (USD eq.)", kind: "usd" }],
          rows: [...byLender.entries()].map(([id, e]) => [lend(id), e.active, e.accepted, e.rejected, e.other, avg(e.apr) === null ? "—" : `${avg(e.apr)!.toFixed(2)}%`, avg(e.pay)]),
        };
      }
    }
  }, [reportId, apps, data]);

  const fmt = (v: string | number | null, k: Kind): string => {
    if (v === null || v === undefined || v === "") return "—";
    switch (k) {
      case "usd": return formatMoney(Number(v), "USD");
      case "pct": return formatPercent(Number(v) * 100, 0);
      case "date": return formatDate(String(v));
      case "days": return `${Number(v).toFixed(Number.isInteger(Number(v)) ? 0 : 1)}d`;
      case "num": return String(v);
      default: return String(v);
    }
  };

  const meta = REPORTS.find((r) => r.id === reportId)!;
  const exportCsv = () => {
    downloadCsv(`${reportId}-report.csv`, [
      report.columns.map((c) => c.label),
      ...report.rows.map((r) => r.map((v, i) => (report.columns[i]!.kind === "pct" && typeof v === "number" ? Math.round(v * 1000) / 10 : typeof v === "number" ? Math.round(v * 100) / 100 : v))),
    ]);
  };

  return (
    <>
      <PageHeader
        title="Reports"
        description="Calculated from the same demo data as the dashboard. Filter, review and export to CSV."
        actions={
          <Button onClick={exportCsv} disabled={!can("report.export") || report.rows.length === 0}>
            <Download /> Export CSV
          </Button>
        }
      />
      <MetricFilterBar value={filters} onChange={setFilters} extended />
      <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
        <nav aria-label="Reports" className="lg:sticky lg:top-20 lg:self-start">
          <ul className="flex gap-1 overflow-x-auto lg:flex-col">
            {REPORTS.map((r) => (
              <li key={r.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => setReportId(r.id)}
                  aria-current={r.id === reportId ? "page" : undefined}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${r.id === reportId ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                >
                  {r.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <SectionCard
          title={meta.label}
          description={`${meta.description} · ${RANGE_LABEL[filters.range]} · ${apps.length} application${apps.length === 1 ? "" : "s"} in scope`}
          flush
        >
          {report.rows.length === 0 ? (
            <EmptyState icon={FileBarChart} title="No data for these filters" description="Widen the date range or clear a filter." />
          ) : (
            <div className="overflow-x-auto">
              <Table className="text-[13px]">
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    {report.columns.map((c) => (
                      <TableHead key={c.label} className={`text-xs ${c.kind === "text" || c.kind === "date" ? "" : "text-right"}`}>
                        {c.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.rows.map((r, i) => (
                    <TableRow key={i}>
                      {r.map((v, j) => (
                        <TableCell key={j} className={`${report.columns[j]!.kind === "text" || report.columns[j]!.kind === "date" ? "" : "tnum text-right"} ${j === 0 ? "font-medium" : ""}`}>
                          {fmt(v, report.columns[j]!.kind)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {report.note && <div className="border-t p-3"><Callout tone="info">{report.note}</Callout></div>}
        </SectionCard>
      </div>
    </>
  );
}
