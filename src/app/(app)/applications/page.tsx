"use client";

import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Archive, Columns3, Download, FileText, ListFilter, Plus, Search, Table2, UserCheck, X } from "lucide-react";
import { toast } from "sonner";
import { ApplicationsTable, type SortKey, type SortState } from "@/components/applications/applications-table";
import { PipelineBoard } from "@/components/applications/pipeline-board";
import { EmptyState, FilterSelect, PageHeader, SectionCard } from "@/components/shared/page";
import { Pagination } from "@/components/shared/pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CUSTOMER_TYPE_LABEL, FINANCING_TYPE_LABEL } from "@/domain/labels";
import { APPLICATION_STATUS_META, APPLICATION_STATUS_ORDER, APPROVED_STATUSES, PENDING_STATUSES } from "@/domain/status";
import type { FinancingApplication } from "@/domain/types";
import { downloadCsv } from "@/lib/metrics";
import { customerDisplayName, robotLabel } from "@/lib/selectors";
import { cn } from "@/lib/utils";
import { useStore } from "@/store/store";

const TABS: { key: string; label: string; match: (a: FinancingApplication) => boolean }[] = [
  { key: "all", label: "All", match: (a) => !a.archived },
  { key: "draft", label: "Drafts", match: (a) => !a.archived && a.status === "draft" },
  { key: "docs", label: "Needs documents", match: (a) => !a.archived && a.status === "needs_documents" },
  { key: "ready", label: "Ready to submit", match: (a) => !a.archived && a.status === "ready_to_submit" },
  { key: "pending", label: "Pending decision", match: (a) => !a.archived && PENDING_STATUSES.includes(a.status) },
  { key: "approved", label: "Approved", match: (a) => !a.archived && APPROVED_STATUSES.includes(a.status) },
  { key: "funded", label: "Funded", match: (a) => !a.archived && a.status === "funded" },
  { key: "closed", label: "Declined / Closed", match: (a) => !a.archived && (a.status === "declined" || a.status === "closed") },
  { key: "archived", label: "Archived", match: (a) => a.archived },
];

const PAGE_SIZE = 12;

function ApplicationsInner() {
  const { data, actions, can } = useStore();
  const router = useRouter();
  const params = useSearchParams();
  const tab = params.get("tab") ?? "all";
  const [view, setView] = useState<"table" | "pipeline">("table");
  const [q, setQ] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({ customerType: "all", financingType: "all", country: "all", employee: "all", lender: "all", status: "all", min: "", max: "" });
  const [sort, setSort] = useState<SortState>({ key: "lastActivityAt", dir: "desc" });
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const customers = useMemo(() => new Map(data.customers.map((c) => [c.id, c])), [data.customers]);
  const employees = useMemo(() => new Map(data.employees.map((e) => [e.id, e])), [data.employees]);

  const activeFilterCount = Object.entries(filters).filter(([, v]) => v !== "all" && v !== "").length;

  const baseFiltered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const lenderApps = filters.lender === "all" ? null : new Set(data.submissions.filter((s) => s.lenderId === filters.lender).map((s) => s.applicationId));
    const min = filters.min ? Number(filters.min) : null;
    const max = filters.max ? Number(filters.max) : null;
    return data.applications.filter((a) => {
      const c = customers.get(a.customerId);
      if (term) {
        const hay = [a.id, customerDisplayName(c), c?.name ?? "", a.robot.manufacturer, a.robot.model, employees.get(a.assignedEmployeeId)?.name ?? ""].join(" ").toLowerCase();
        if (!hay.includes(term)) return false;
      }
      if (filters.customerType !== "all" && c?.type !== filters.customerType) return false;
      if (filters.financingType !== "all" && a.financingType !== filters.financingType) return false;
      if (filters.country !== "all" && a.country !== filters.country) return false;
      if (filters.employee !== "all" && a.assignedEmployeeId !== filters.employee) return false;
      if (filters.status !== "all" && a.status !== filters.status) return false;
      if (lenderApps && !lenderApps.has(a.id)) return false;
      if (min !== null && a.requestedAmount < min) return false;
      if (max !== null && a.requestedAmount > max) return false;
      return true;
    });
  }, [data.applications, data.submissions, customers, employees, q, filters]);

  const tabCounts = useMemo(() => Object.fromEntries(TABS.map((t) => [t.key, baseFiltered.filter(t.match).length])), [baseFiltered]);
  const currentTab = TABS.find((t) => t.key === tab) ?? TABS[0]!;

  const sorted = useMemo(() => {
    const rows = baseFiltered.filter(currentTab.match);
    const val = (a: FinancingApplication): string | number => {
      switch (sort.key) {
        case "id": return Number(a.id.replace(/\D/g, ""));
        case "customer": return customerDisplayName(customers.get(a.customerId)).toLowerCase();
        case "robot": return robotLabel(a).toLowerCase();
        case "purchaseTotal": return a.purchaseTotal;
        case "requestedAmount": return a.requestedAmount;
        case "financingType": return a.financingType;
        case "employee": return employees.get(a.assignedEmployeeId)?.name ?? "";
        case "status": return APPLICATION_STATUS_ORDER.indexOf(a.status);
        case "submittedAt": return a.submittedAt ?? "";
        case "lastActivityAt": return a.lastActivityAt;
      }
    };
    return [...rows].sort((x, y) => {
      const a = val(x);
      const b = val(y);
      const cmp = a < b ? -1 : a > b ? 1 : 0;
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [baseFiltered, currentTab, sort, customers, employees]);

  const pageRows = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const setTab = (key: string) => {
    setPage(1);
    setSelected(new Set());
    router.replace(key === "all" ? "/applications" : `/applications?tab=${key}`);
  };
  const onSort = (key: SortKey) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
    setPage(1);
  };
  const exportCsv = (rows: FinancingApplication[]) => {
    downloadCsv("applications.csv", [
      ["Application", "Customer", "Type", "Robot", "Purchase price", "Requested", "Financing", "Currency", "Employee", "Status", "Submitted", "Last activity"],
      ...rows.map((a) => [
        a.id,
        customerDisplayName(customers.get(a.customerId)),
        customers.get(a.customerId)?.type ?? "",
        robotLabel(a),
        a.purchaseTotal,
        a.requestedAmount,
        a.financingType,
        a.currency,
        employees.get(a.assignedEmployeeId)?.name ?? "",
        APPLICATION_STATUS_META[a.status].label,
        a.submittedAt?.slice(0, 10) ?? "",
        a.lastActivityAt.slice(0, 10),
      ]),
    ]);
    toast.success(`Exported ${rows.length} application${rows.length === 1 ? "" : "s"} to CSV`);
  };

  const selectedApps = sorted.filter((a) => selected.has(a.id));
  const pipelineApps = baseFiltered.filter((a) => !a.archived);

  return (
    <>
      <PageHeader
        title="Applications"
        description="Create, track and move financing applications through the approval pipeline."
        actions={
          <>
            <div className="inline-flex rounded-lg border bg-card p-0.5" role="group" aria-label="View">
              {(["table", "pipeline"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  aria-pressed={view === v}
                  className={cn("inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium", view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
                >
                  {v === "table" ? <Table2 className="size-3.5" /> : <Columns3 className="size-3.5" />}
                  {v === "table" ? "Table" : "Pipeline"}
                </button>
              ))}
            </div>
            <Button variant="outline" onClick={() => exportCsv(sorted)}>
              <Download /> Export
            </Button>
            {can("application.create") && (
              <Button asChild>
                <Link href="/applications/new">
                  <Plus /> New application
                </Link>
              </Button>
            )}
          </>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-80">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Search ID, customer, robot, employee…"
            className="h-9 bg-card pl-8"
            aria-label="Search applications"
          />
        </div>
        <Button variant={showFilters ? "secondary" : "outline"} size="lg" className="h-9" onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters}>
          <ListFilter /> Filters
          {activeFilterCount > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">{activeFilterCount}</span>}
        </Button>
        {(activeFilterCount > 0 || q) && (
          <Button
            variant="ghost"
            size="lg"
            className="h-9"
            onClick={() => {
              setQ("");
              setFilters({ customerType: "all", financingType: "all", country: "all", employee: "all", lender: "all", status: "all", min: "", max: "" });
            }}
          >
            <X /> Clear
          </Button>
        )}
      </div>

      {showFilters && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
          <FilterSelect label="Customer" value={filters.customerType} onChange={(v) => setFilters({ ...filters, customerType: v })} options={Object.entries(CUSTOMER_TYPE_LABEL).map(([value, label]) => ({ value, label }))} />
          <FilterSelect label="Financing" value={filters.financingType} onChange={(v) => setFilters({ ...filters, financingType: v })} options={Object.entries(FINANCING_TYPE_LABEL).map(([value, label]) => ({ value, label }))} />
          <FilterSelect label="Country" value={filters.country} onChange={(v) => setFilters({ ...filters, country: v })} options={[{ value: "US", label: "United States" }, { value: "CA", label: "Canada" }]} />
          <FilterSelect label="Employee" value={filters.employee} onChange={(v) => setFilters({ ...filters, employee: v })} options={data.employees.map((e) => ({ value: e.id, label: e.name }))} />
          <FilterSelect label="Lender" value={filters.lender} onChange={(v) => setFilters({ ...filters, lender: v })} options={data.lenders.map((l) => ({ value: l.id, label: l.name }))} />
          <FilterSelect label="Status" value={filters.status} onChange={(v) => setFilters({ ...filters, status: v })} options={APPLICATION_STATUS_ORDER.map((s) => ({ value: s, label: APPLICATION_STATUS_META[s].label }))} />
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Requested
            <Input type="number" inputMode="numeric" placeholder="Min" value={filters.min} onChange={(e) => setFilters({ ...filters, min: e.target.value })} className="h-7 w-24 bg-card" aria-label="Minimum requested amount" />
            –
            <Input type="number" inputMode="numeric" placeholder="Max" value={filters.max} onChange={(e) => setFilters({ ...filters, max: e.target.value })} className="h-7 w-24 bg-card" aria-label="Maximum requested amount" />
          </div>
        </div>
      )}

      {view === "table" ? (
        <>
          <div className="mb-3 flex gap-1 overflow-x-auto border-b" role="tablist" aria-label="Status filter">
            {TABS.map((t) => (
              <button
                key={t.key}
                role="tab"
                aria-selected={tab === t.key || (tab === "all" && t.key === "all")}
                onClick={() => setTab(t.key)}
                className={cn(
                  "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-[13px] font-medium transition-colors",
                  currentTab.key === t.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
                <span className={cn("rounded-full px-1.5 text-[11px]", currentTab.key === t.key ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>{tabCounts[t.key]}</span>
              </button>
            ))}
          </div>

          {selected.size > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm" role="region" aria-label="Bulk actions">
              <span className="font-medium">{selected.size} selected</span>
              <span className="mx-1 h-4 w-px bg-border" />
              <Select
                onValueChange={(empId) => {
                  const r = actions.assignApplications([...selected], empId);
                  if (r.ok) toast.success(`Reassigned ${r.value} application${r.value === 1 ? "" : "s"}`);
                  setSelected(new Set());
                }}
                disabled={!can("application.edit")}
              >
                <SelectTrigger size="sm" className="bg-card" aria-label="Reassign selected">
                  <UserCheck className="size-3.5" />
                  <SelectValue placeholder="Reassign to…" />
                </SelectTrigger>
                <SelectContent>
                  {data.employees.filter((e) => e.active).map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={() => exportCsv(selectedApps)}>
                <Download /> Export selected
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!can("application.archive")}
                onClick={() => {
                  let n = 0;
                  selectedApps.forEach((a) => {
                    const r = actions.archiveApplication(a.id, !a.archived);
                    if (r.ok) n += 1;
                  });
                  if (n) toast.success(`${currentTab.key === "archived" ? "Restored" : "Archived"} ${n} application${n === 1 ? "" : "s"}`);
                  setSelected(new Set());
                }}
              >
                <Archive /> {currentTab.key === "archived" ? "Restore" : "Archive"}
              </Button>
              <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setSelected(new Set())}>
                Clear selection
              </Button>
            </div>
          )}

          <SectionCard flush>
            {pageRows.length === 0 ? (
              <EmptyState
                icon={FileText}
                title={baseFiltered.length === 0 ? "No applications match your search" : "Nothing in this view"}
                description="Try a different tab, clear filters, or create a new application."
                action={
                  can("application.create") && (
                    <Button asChild>
                      <Link href="/applications/new">
                        <Plus /> New application
                      </Link>
                    </Button>
                  )
                }
              />
            ) : (
              <>
                <ApplicationsTable apps={pageRows} sort={sort} onSort={onSort} selected={selected} onSelect={setSelected} />
                <Pagination page={page} pageSize={PAGE_SIZE} total={sorted.length} onPage={setPage} />
              </>
            )}
          </SectionCard>
        </>
      ) : (
        <>
          <p className="mb-3 text-xs text-muted-foreground">
            Drag a card to another column to change its status, or use the card menu. Invalid moves are blocked and each change is logged, notified and reflected on the dashboard.
          </p>
          <PipelineBoard apps={pipelineApps} />
        </>
      )}
    </>
  );
}

export default function ApplicationsPage() {
  return (
    <Suspense fallback={null}>
      <ApplicationsInner />
    </Suspense>
  );
}
