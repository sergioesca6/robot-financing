"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertCircle, ArrowRight, BadgeCheck, CheckCircle2, Clock, FileCheck2, FileText, Percent, Plus, Wallet, Landmark } from "lucide-react";
import { ApplicationVolumeChart, DecisionsChart, LenderChart, ProductChart, VolumeChart } from "@/components/dashboard/charts";
import { AppStatusBadge, SubmissionBadge } from "@/components/shared/badges";
import { MetricFilterBar } from "@/components/shared/metric-filters";
import { EmptyState, KpiCard, LenderAvatar, PageHeader, SectionCard } from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DEFAULT_FILTERS, computeKpis, filterApplications, lenderStats, monthlySeries, productStats, type MetricFilters } from "@/lib/metrics";
import { formatDate, formatMoney, formatPercent, formatRelative } from "@/lib/format";
import { customerDisplayName, documentCompleteness, robotLabel } from "@/lib/selectors";
import { useStore } from "@/store/store";

export default function DashboardPage() {
  const { data, actions, can } = useStore();
  const [filters, setFilters] = useState<MetricFilters>(DEFAULT_FILTERS);

  const view = useMemo(() => {
    const now = new Date();
    const apps = filterApplications(data, filters, now);
    const ids = new Set(apps.map((a) => a.id));
    const customers = new Map(data.customers.map((c) => [c.id, c]));
    const kpis = computeKpis(apps);
    const months = monthlySeries(apps, 12, now);
    const lenders = lenderStats(data, apps);
    const products = productStats(apps);

    const recent = [...apps].sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt)).slice(0, 6);

    const awaitingDocs = apps
      .filter((a) => !["draft", "declined", "closed", "funded"].includes(a.status))
      .map((a) => ({ app: a, comp: documentCompleteness(data.documents.filter((d) => d.applicationId === a.id)) }))
      .filter((x) => x.comp.missing.length > 0)
      .sort((a, b) => b.comp.missing.length - a.comp.missing.length)
      .slice(0, 5);

    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);
    const followUps = data.tasks
      .filter((t) => !t.done && t.applicationId && ids.has(t.applicationId) && new Date(t.dueDate) <= endOfToday)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .slice(0, 5);
    const expiring = data.offers
      .filter((o) => o.status === "active" && ids.has(o.applicationId) && new Date(o.expiresAt).getTime() - now.getTime() < 7 * 86_400_000 && new Date(o.expiresAt) > now)
      .slice(0, 3);

    const decisions = data.submissions
      .filter((s) => ids.has(s.applicationId) && s.decisionAt && s.status !== "withdrawn")
      .sort((a, b) => b.decisionAt!.localeCompare(a.decisionAt!))
      .slice(0, 5);

    const upcoming = data.tasks
      .filter((t) => !t.done && (!t.applicationId || ids.has(t.applicationId)))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .slice(0, 6);

    return { apps, customers, kpis, months, lenders, products, recent, awaitingDocs, followUps, expiring, decisions, upcoming, now };
  }, [data, filters]);

  const { kpis } = view;
  const appMap = new Map(data.applications.map((a) => [a.id, a]));

  return (
    <>
      <PageHeader
        title="Financing operations"
        description="Pipeline health, lender activity and follow-ups across the U.S. and Canada."
        actions={
          can("application.create") && (
            <Button asChild>
              <Link href="/applications/new">
                <Plus /> New application
              </Link>
            </Button>
          )
        }
      />
      <MetricFilterBar value={filters} onChange={setFilters} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Total applications" value={kpis.total} icon={FileText} sub="Excl. archived" href="/applications" />
        <KpiCard label="Pending approvals" value={kpis.pending} icon={Clock} sub="Submitted to decision" href="/applications?tab=pending" />
        <KpiCard label="Approved" value={kpis.approved} icon={CheckCircle2} sub="Incl. accepted & funded" href="/applications?tab=approved" />
        <KpiCard label="Funded deals" value={kpis.funded} icon={BadgeCheck} sub={formatMoney(kpis.fundedVolumeUsd, "USD", { compact: true }) + " funded"} href="/applications?tab=funded" />
        <KpiCard label="Financing volume" value={formatMoney(kpis.volumeUsd, "USD", { compact: true })} icon={Wallet} sub="USD-equivalent, requested" />
        <KpiCard label="Approval rate" value={formatPercent(kpis.approvalRate === null ? null : kpis.approvalRate * 100, 0)} icon={Percent} sub={`${kpis.approved} approved · ${kpis.declined} declined`} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-12">
        <SectionCard className="lg:col-span-7" title="Application volume by month" description="Applications created per month">
          <ApplicationVolumeChart data={view.months} />
        </SectionCard>
        <SectionCard className="lg:col-span-5" title="Approved vs. declined" description="By application creation month">
          <DecisionsChart data={view.months} />
        </SectionCard>
        <SectionCard className="lg:col-span-7" title="Financing volume over time" description="USD-equivalent (CAD converted at demo rate 1.36). Funded volume is plotted by funding month.">
          <VolumeChart data={view.months} />
        </SectionCard>
        <SectionCard className="lg:col-span-5" title="Applications by lender" description="Lender submissions in the selected period">
          {view.lenders.length ? <LenderChart data={view.lenders} /> : <EmptyState icon={Landmark} title="No lender submissions" description="Adjust the filters to see lender activity." />}
        </SectionCard>
        <SectionCard className="lg:col-span-4" title="Loan vs. lease" description="Share of applications">
          <ProductChart data={view.products} />
        </SectionCard>

        <SectionCard
          className="lg:col-span-8"
          title="Recent applications"
          description="Latest activity first"
          action={
            <Button asChild variant="ghost" size="sm">
              <Link href="/applications">
                View all <ArrowRight />
              </Link>
            </Button>
          }
          flush
        >
          {view.recent.length === 0 ? (
            <EmptyState icon={FileText} title="No applications match these filters" />
          ) : (
            <ul className="divide-y">
              {view.recent.map((a) => (
                <li key={a.id}>
                  <Link href={`/applications/${a.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50">
                    <span className="w-[72px] shrink-0 font-mono text-xs text-muted-foreground">{a.id}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{customerDisplayName(view.customers.get(a.customerId))}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {robotLabel(a)} · {a.financingType === "loan" ? "Loan" : "Lease"}
                      </span>
                    </span>
                    <span className="tnum hidden text-sm sm:block">{formatMoney(a.requestedAmount, a.currency)}</span>
                    <AppStatusBadge status={a.status} />
                    <span className="hidden w-16 text-right text-xs text-muted-foreground md:block">{formatRelative(a.lastActivityAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <SectionCard title="Deals awaiting documents" description="Required documents missing or rejected" flush>
          {view.awaitingDocs.length === 0 ? (
            <EmptyState icon={FileCheck2} title="All caught up" description="No active deals are waiting on documents." />
          ) : (
            <ul className="divide-y">
              {view.awaitingDocs.map(({ app, comp }) => (
                <li key={app.id}>
                  <Link href={`/applications/${app.id}?tab=documents`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{customerDisplayName(view.customers.get(app.customerId))}</span>
                      <span className="block truncate text-xs text-muted-foreground">{comp.missing.map((m) => m.label).join(", ")}</span>
                    </span>
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-inset ring-amber-600/20">
                      {comp.missing.length} missing
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Requires follow-up" description="Due or overdue, and offers expiring within 7 days" flush>
          {view.followUps.length + view.expiring.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="Nothing due" description="No follow-ups are due today." />
          ) : (
            <ul className="divide-y">
              {view.followUps.map((t) => {
                const overdue = new Date(t.dueDate) < new Date(new Date().setHours(0, 0, 0, 0));
                return (
                  <li key={t.id}>
                    <Link href={`/applications/${t.applicationId}`} className="flex items-start gap-3 px-4 py-2.5 hover:bg-muted/50">
                      <AlertCircle className={`mt-0.5 size-4 shrink-0 ${overdue ? "text-red-500" : "text-amber-500"}`} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm">{t.title}</span>
                        <span className={`text-xs ${overdue ? "text-red-600" : "text-muted-foreground"}`}>
                          {overdue ? "Overdue · " : "Due today · "}
                          {formatDate(t.dueDate)}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
              {view.expiring.map((o) => (
                <li key={o.id}>
                  <Link href={`/applications/${o.applicationId}?tab=offers`} className="flex items-start gap-3 px-4 py-2.5 hover:bg-muted/50">
                    <Clock className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm">
                        Offer expiring — {data.lenders.find((l) => l.id === o.lenderId)?.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {customerDisplayName(view.customers.get(appMap.get(o.applicationId)!.customerId))} · expires {formatRelative(o.expiresAt)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Recent lender decisions" description="Per-lender outcomes, independent of application status" flush>
          {view.decisions.length === 0 ? (
            <EmptyState icon={Landmark} title="No decisions yet" />
          ) : (
            <ul className="divide-y">
              {view.decisions.map((s) => {
                const lender = data.lenders.find((l) => l.id === s.lenderId)!;
                const app = appMap.get(s.applicationId)!;
                return (
                  <li key={s.id}>
                    <Link href={`/applications/${app.id}?tab=lenders`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50">
                      <LenderAvatar lender={lender} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{lender.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{customerDisplayName(view.customers.get(app.customerId))}</span>
                      </span>
                      <SubmissionBadge status={s.status} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>

        <SectionCard className="xl:col-span-3 lg:col-span-2" title="Upcoming tasks" description="Open follow-ups sorted by due date" flush>
          {view.upcoming.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="No open tasks" />
          ) : (
            <ul className="grid divide-y md:grid-cols-2 md:divide-y-0">
              {view.upcoming.map((t) => {
                const overdue = new Date(t.dueDate) < new Date(new Date().setHours(0, 0, 0, 0));
                const app = t.applicationId ? appMap.get(t.applicationId) : undefined;
                return (
                  <li key={t.id} className="flex items-start gap-3 border-b px-4 py-2.5 md:odd:border-r">
                    <Checkbox
                      className="mt-0.5"
                      checked={t.done}
                      onCheckedChange={() => actions.toggleTask(t.id)}
                      aria-label={`Mark “${t.title}” complete`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm">{t.title}</span>
                      <span className="text-xs text-muted-foreground">
                        <span className={overdue ? "font-medium text-red-600" : ""}>{formatDate(t.dueDate)}</span>
                        {app && (
                          <>
                            {" · "}
                            <Link href={`/applications/${app.id}`} className="hover:underline">
                              {app.id}
                            </Link>
                          </>
                        )}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
      </div>
    </>
  );
}
