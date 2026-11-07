"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BadgeCheck, Coins, Download, Pencil } from "lucide-react";
import { toast } from "sonner";
import { CommissionBadge } from "@/components/shared/badges";
import { Callout, EmptyState, FilterSelect, KpiCard, PageHeader, SectionCard } from "@/components/shared/page";
import { Pagination } from "@/components/shared/pagination";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { COMMISSION_KIND_LABEL } from "@/domain/labels";
import { COMMISSION_STATUS_META } from "@/domain/status";
import type { Commission, CommissionKind, CommissionStatus } from "@/domain/types";
import { salespersonPercent } from "@/lib/commissions";
import { CHART } from "@/lib/chart-colors";
import { formatDate, formatMoney, monthKey, monthLabel } from "@/lib/format";
import { downloadCsv, toUsd } from "@/lib/metrics";
import { useStore } from "@/store/store";

const PAGE = 12;
const axis = { tick: { fontSize: 11, fill: CHART.axis }, tickLine: false, axisLine: false } as const;
const tip = { contentStyle: { borderRadius: 8, border: "1px solid #e6e9f0", fontSize: 12 } };
const usd = (c: Commission) => toUsd(c.actual ?? c.estimated, c.currency);

export default function CommissionsPage() {
  return (
    <Suspense fallback={null}>
      <Page />
    </Suspense>
  );
}

function Page() {
  const { data, actions, can, currentUser } = useStore();
  const params = useSearchParams();
  const appFilter = params.get("application");
  const viewAll = can("commission.viewAll");
  const manage = can("commission.manage");
  const [status, setStatus] = useState("all");
  const [kind, setKind] = useState("all");
  const [employee, setEmployee] = useState("all");
  const [lender, setLender] = useState("all");
  const [page, setPage] = useState(1);
  const [edit, setEdit] = useState<Commission | null>(null);

  // UI-only role restriction: sales reps see just their own salesperson commissions.
  const visible = useMemo(() => data.commissions.filter((c) => c.status !== "void" && (viewAll || (c.kind === "salesperson" && c.employeeId === currentUser.id))), [data.commissions, viewAll, currentUser.id]);
  const rows = useMemo(
    () =>
      visible
        .filter((c) => (status === "all" || c.status === status) && (kind === "all" || c.kind === kind) && (employee === "all" || c.employeeId === employee) && (lender === "all" || c.lenderId === lender) && (!appFilter || c.applicationId === appFilter))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [visible, status, kind, employee, lender, appFilter],
  );

  const sum = (s: CommissionStatus) => visible.filter((c) => c.status === s).reduce((t, c) => t + usd(c), 0);
  const total = sum("estimated") + sum("pending") + sum("paid");

  const byEmployee = useMemo(() => {
    const m = new Map<string, { name: string; estimated: number; pending: number; paid: number }>();
    visible.filter((c) => c.employeeId).forEach((c) => {
      const e = m.get(c.employeeId!) ?? { name: data.employees.find((x) => x.id === c.employeeId)?.name.split(" ")[0] ?? "?", estimated: 0, pending: 0, paid: 0 };
      if (c.status === "estimated" || c.status === "pending" || c.status === "paid") e[c.status] += usd(c);
      m.set(c.employeeId!, e);
    });
    return [...m.values()].sort((a, b) => b.paid + b.pending + b.estimated - (a.paid + a.pending + a.estimated));
  }, [visible, data.employees]);

  const byLender = useMemo(() => {
    const m = new Map<string, { name: string; estimated: number; pending: number; paid: number }>();
    visible.filter((c) => c.kind !== "salesperson").forEach((c) => {
      const l = data.lenders.find((x) => x.id === c.lenderId);
      const e = m.get(c.lenderId) ?? { name: (l?.name ?? "?").split(" ")[0]!, estimated: 0, pending: 0, paid: 0 };
      if (c.status === "estimated" || c.status === "pending" || c.status === "paid") e[c.status] += usd(c);
      m.set(c.lenderId, e);
    });
    return [...m.values()].sort((a, b) => b.paid + b.pending + b.estimated - (a.paid + a.pending + a.estimated));
  }, [visible, data.lenders]);

  const trend = useMemo(() => {
    const m = new Map<string, { label: string; estimated: number; pending: number; paid: number }>();
    visible.forEach((c) => {
      const k = monthKey(c.paidAt ?? c.createdAt);
      const e = m.get(k) ?? { label: monthLabel(k), estimated: 0, pending: 0, paid: 0 };
      if (c.status === "estimated" || c.status === "pending" || c.status === "paid") e[c.status] += usd(c);
      m.set(k, e);
    });
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-8).map(([, v]) => v);
  }, [visible]);

  const exportCsv = () =>
    downloadCsv("commissions.csv", [
      ["Application", "Type", "Employee", "Lender", "Basis", "Rate", "Funding amount", "Currency", "Estimated", "Actual", "Status"],
      ...rows.map((c) => [c.applicationId, COMMISSION_KIND_LABEL[c.kind], data.employees.find((e) => e.id === c.employeeId)?.name ?? "", data.lenders.find((l) => l.id === c.lenderId)?.name ?? "", c.basis, c.rate, c.fundingAmount, c.currency, c.estimated, c.actual ?? "", c.status]),
    ]);

  const pageRows = rows.slice((page - 1) * PAGE, page * PAGE);
  const money = (n: number) => formatMoney(n, "USD", { compact: true });
  const stackBars = (
    <>
      <Bar dataKey="paid" name="Paid" stackId="a" fill={CHART.green} />
      <Bar dataKey="pending" name="Pending" stackId="a" fill={CHART.amber} />
      <Bar dataKey="estimated" name="Estimated" stackId="a" fill={CHART.slate} radius={[4, 4, 0, 0]} />
    </>
  );

  return (
    <>
      <PageHeader
        title="Commissions"
        description="Rule-based earnings: lender dealer fees, flat financing fees and salesperson commission. Amounts are not derived from customer interest."
        actions={
          <Button variant="outline" onClick={exportCsv} disabled={!can("report.export") || rows.length === 0}>
            <Download /> Export CSV
          </Button>
        }
      />
      {!viewAll && <Callout tone="info" className="mb-4">Showing only your own salesperson commissions (demo role restriction — UI simulation, not real access control).</Callout>}
      {appFilter && (
        <Callout tone="info" className="mb-4">
          Filtered to {appFilter}.{" "}
          <Link className="font-medium underline" href="/commissions">
            Clear filter
          </Link>
        </Callout>
      )}

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total (USD eq.)" value={money(total)} sub="estimated + pending + paid" icon={Coins} />
        <KpiCard label="Estimated" value={money(sum("estimated"))} sub="deals not yet funded" />
        <KpiCard label="Pending payment" value={money(sum("pending"))} sub="funded, awaiting payout" />
        <KpiCard label="Paid" value={money(sum("paid"))} sub="actual amounts" />
      </div>

      <div className="mb-4 grid gap-4 xl:grid-cols-3">
        <SectionCard title="By employee">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={byEmployee} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="name" {...axis} />
              <YAxis {...axis} width={48} tickFormatter={(v: number) => money(v)} />
              <Tooltip {...tip} formatter={(v) => formatMoney(Number(v), "USD")} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
              {stackBars}
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>
        <SectionCard title="By lender" description="Dealer and financing fees">
          {byLender.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Lender fees aren&apos;t shown for your role.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={byLender} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={CHART.grid} vertical={false} />
                <XAxis dataKey="name" {...axis} />
                <YAxis {...axis} width={48} tickFormatter={(v: number) => money(v)} />
                <Tooltip {...tip} formatter={(v) => formatMoney(Number(v), "USD")} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                {stackBars}
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>
        <SectionCard title="Monthly trend">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="label" {...axis} />
              <YAxis {...axis} width={48} tickFormatter={(v: number) => money(v)} />
              <Tooltip {...tip} formatter={(v) => formatMoney(Number(v), "USD")} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
              {stackBars}
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>
      </div>

      <SectionCard flush title="Commission lines" description="Estimated until a deal is funded, then pending until marked paid.">
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <FilterSelect label="Status" value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={(["estimated", "pending", "paid"] as CommissionStatus[]).map((s) => ({ value: s, label: COMMISSION_STATUS_META[s].label }))} />
          <FilterSelect label="Type" value={kind} onChange={(v) => { setKind(v); setPage(1); }} options={(Object.keys(COMMISSION_KIND_LABEL) as CommissionKind[]).map((k) => ({ value: k, label: COMMISSION_KIND_LABEL[k] }))} />
          {viewAll && <FilterSelect label="Employee" value={employee} onChange={(v) => { setEmployee(v); setPage(1); }} options={data.employees.map((e) => ({ value: e.id, label: e.name }))} />}
          {viewAll && <FilterSelect label="Lender" value={lender} onChange={(v) => { setLender(v); setPage(1); }} options={data.lenders.map((l) => ({ value: l.id, label: l.name }))} />}
        </div>
        {rows.length === 0 ? (
          <EmptyState icon={Coins} title="No commissions match" description="Commissions are created when an offer is accepted and become payable when the deal is funded." />
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[1000px] text-[13px]">
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="text-xs">Application</TableHead>
                  <TableHead className="text-xs">Type</TableHead>
                  <TableHead className="text-xs">Employee / lender</TableHead>
                  <TableHead className="text-xs">Rule</TableHead>
                  <TableHead className="text-right text-xs">Funded amount</TableHead>
                  <TableHead className="text-right text-xs">Estimated</TableHead>
                  <TableHead className="text-right text-xs">Actual</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="w-40" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link href={`/applications/${c.applicationId}`} className="font-mono text-xs text-primary hover:underline">
                        {c.applicationId}
                      </Link>
                    </TableCell>
                    <TableCell>{COMMISSION_KIND_LABEL[c.kind]}</TableCell>
                    <TableCell>
                      {c.employeeId ? data.employees.find((e) => e.id === c.employeeId)?.name : data.lenders.find((l) => l.id === c.lenderId)?.name}
                      {c.employeeId && <p className="text-xs text-muted-foreground">{data.lenders.find((l) => l.id === c.lenderId)?.name}</p>}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{c.basis === "percent" ? `${c.rate}% of funded` : `Flat ${formatMoney(c.rate, c.currency)}`}</TableCell>
                    <TableCell className="tnum text-right">{formatMoney(c.fundingAmount, c.currency)}</TableCell>
                    <TableCell className="tnum text-right">{formatMoney(c.estimated, c.currency, { decimals: true })}</TableCell>
                    <TableCell className="tnum text-right">{c.actual !== undefined ? formatMoney(c.actual, c.currency, { decimals: true }) : "—"}</TableCell>
                    <TableCell>
                      <CommissionBadge status={c.status} />
                      {c.paidAt && <p className="text-xs text-muted-foreground">{formatDate(c.paidAt)}</p>}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="outline"
                          size="xs"
                          disabled={!manage || c.status !== "pending"}
                          title={c.status === "estimated" ? "Available once the deal is funded" : undefined}
                          onClick={() => {
                            const r = actions.updateCommission(c.id, { status: "paid" });
                            if (r.ok) toast.success("Marked paid");
                          }}
                        >
                          <BadgeCheck /> Mark paid
                        </Button>
                        <Button variant="ghost" size="icon-sm" aria-label="Edit commission" disabled={!manage || c.status === "paid"} onClick={() => setEdit(c)}>
                          <Pencil />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <Pagination page={page} pageSize={PAGE} total={rows.length} onPage={setPage} />
      </SectionCard>

      <SectionCard title="Active commission rules" className="mt-4" description="Edit in Settings → Commission rules and Lenders → Settings.">
        <div className="grid gap-4 text-sm md:grid-cols-2">
          <div>
            <p className="mb-1 font-medium">Salesperson</p>
            <p className="text-muted-foreground">
              Default {data.settings.commissionRules.defaultPercent}% of funded amount.
              {Object.keys(data.settings.commissionRules.overrides).length > 0 && ` Overrides: ${Object.keys(data.settings.commissionRules.overrides).map((id) => `${data.employees.find((e) => e.id === id)?.name.split(" ")[0]} ${salespersonPercent(data.settings, id)}%`).join(", ")}.`}
            </p>
          </div>
          {viewAll && (
            <div>
              <p className="mb-1 font-medium">Lender dealer / financing fees</p>
              <ul className="space-y-0.5 text-muted-foreground">
                {data.lenders.filter((l) => l.active).slice(0, 5).map((l) => (
                  <li key={l.id}>
                    {l.name}: {l.commission.dealerFeePercent}% + {formatMoney(l.commission.financingFeeFlat, "USD")} flat
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </SectionCard>
      {edit && <EditDialog c={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function EditDialog({ c, onClose }: { c: Commission; onClose: () => void }) {
  const { actions } = useStore();
  const [rate, setRate] = useState(String(c.rate));
  const [actual, setActual] = useState(c.actual !== undefined ? String(c.actual) : "");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit commission</DialogTitle>
          <DialogDescription>
            {COMMISSION_KIND_LABEL[c.kind]} on {c.applicationId}. Changing the {c.basis === "percent" ? "percentage" : "flat amount"} recalculates the estimate.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="c-rate" className="text-xs">{c.basis === "percent" ? "Rate (%)" : `Flat amount (${c.currency})`}</Label>
            <Input id="c-rate" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
          </div>
          {c.status !== "estimated" && (
            <div className="space-y-1.5">
              <Label htmlFor="c-actual" className="text-xs">Actual amount ({c.currency})</Label>
              <Input id="c-actual" inputMode="decimal" value={actual} onChange={(e) => setActual(e.target.value)} placeholder="Leave empty to use the estimate" />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => {
              const r = Number(rate);
              if (!(r >= 0)) return void toast.error("Enter a valid rate.");
              const a = actual.trim() === "" ? undefined : Number(actual);
              if (a !== undefined && !(a >= 0)) return void toast.error("Enter a valid actual amount.");
              const res = actions.updateCommission(c.id, { rate: r, ...(a !== undefined ? { actual: a } : {}) });
              if (res.ok) {
                toast.success("Commission updated");
                onClose();
              }
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
