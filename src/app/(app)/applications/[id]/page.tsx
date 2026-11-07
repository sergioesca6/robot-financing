"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Archive, ArrowRight, CalendarPlus, Copy, FilePlus2, FileSearch, Landmark, MoreHorizontal, Pencil, Send, StickyNote, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { OfferDialog } from "@/components/applications/offer-dialog";
import { ActivityTab, DocumentsTab, EmailsTab, OffersTab } from "@/components/applications/detail-tabs";
import { StatusMenu } from "@/components/applications/status-menu";
import { SubmissionsTab } from "@/components/applications/submissions-tab";
import { SubmitToLendersDialog } from "@/components/applications/submit-dialog";
import { FundDialog } from "@/components/offers/offer-parts";
import { AppStatusBadge, CommissionBadge, SubmissionBadge } from "@/components/shared/badges";
import { Callout, ConfirmDialog, DataRow, EmptyState, LenderAvatar, PageHeader, PersonAvatar, SectionCard } from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { COMMISSION_KIND_LABEL, CREDIT_LABEL, CUSTOMER_TYPE_LABEL, EMPLOYMENT_LABEL, FINANCING_TYPE_LABEL, OWNERSHIP_LABEL, ROBOT_CATEGORY_LABEL } from "@/domain/labels";
import { APPLICATION_STATUS_META } from "@/domain/status";
import type { FinancingApplication } from "@/domain/types";
import { formatDate, formatMoney, formatRelative, fromDateInput, addDays, toDateInput } from "@/lib/format";
import { customerDisplayName, documentCompleteness, robotLabel } from "@/lib/selectors";
import { validateStatusChange } from "@/lib/workflow";
import { useStore } from "@/store/store";

const TABS = ["overview", "lenders", "offers", "documents", "activity", "emails"] as const;
type Tab = (typeof TABS)[number];

export default function ApplicationDetailPage() {
  return (
    <Suspense fallback={null}>
      <Detail />
    </Suspense>
  );
}

function Detail() {
  const { id } = useParams<{ id: string }>();
  const { data } = useStore();
  const app = data.applications.find((a) => a.id === id);
  if (!app) {
    return (
      <div className="rounded-xl border bg-card">
        <EmptyState
          icon={FileSearch}
          title={`Application ${id} not found`}
          description="It may have been removed or the demo data was reset."
          action={
            <Button asChild>
              <Link href="/applications">Back to applications</Link>
            </Button>
          }
        />
      </div>
    );
  }
  return <Workspace app={app} />;
}

function Workspace({ app }: { app: FinancingApplication }) {
  const { data, actions, can } = useStore();
  const router = useRouter();
  const params = useSearchParams();
  const tabParam = params.get("tab") as Tab | null;
  const tab: Tab = tabParam && TABS.includes(tabParam) ? tabParam : "overview";
  const setTab = (t: string) => router.replace(`/applications/${app.id}?tab=${t}`, { scroll: false });

  const customer = data.customers.find((c) => c.id === app.customerId);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [fundOpen, setFundOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [offerOpen, setOfferOpen] = useState(false);

  const docs = data.documents.filter((d) => d.applicationId === app.id);
  const completeness = documentCompleteness(docs);
  const subs = data.submissions.filter((s) => s.applicationId === app.id);
  const offers = data.offers.filter((o) => o.applicationId === app.id);
  const meta = APPLICATION_STATUS_META[app.status];
  const canSubmit = can("submission.manage") && ["ready_to_submit", "submitted", "under_review", "conditionally_approved", "approved", "declined"].includes(app.status);
  const contractingErr = validateStatusChange(data, app, "contracting");

  const next = nextAction();
  function nextAction(): { title: string; body: string; cta?: { label: string; onClick: () => void; disabled?: boolean; icon?: typeof Send }; tone: "info" | "warning" | "success" } {
    const openConds = subs.flatMap((s) => s.conditions).filter((c) => !c.resolved).length;
    switch (app.status) {
      case "draft":
        return { title: "Finish the application", body: "Complete the remaining wizard steps to move this draft forward.", tone: "info", cta: { label: "Continue editing", onClick: () => router.push(`/applications/${app.id}/edit`), icon: Pencil } };
      case "needs_documents":
        return { title: `${completeness.missing.length} document${completeness.missing.length === 1 ? "" : "s"} outstanding`, body: completeness.missing.map((m) => m.label).join(", ") || "Verify uploaded documents.", tone: "warning", cta: { label: "Review documents", onClick: () => setTab("documents"), icon: FilePlus2 } };
      case "ready_to_submit":
        return { title: "Ready for lenders", body: "Review mock screening results and record your submissions.", tone: "info", cta: { label: "Submit to lenders", onClick: () => setSubmitOpen(true), disabled: !canSubmit, icon: Send } };
      case "submitted":
      case "under_review":
        return { title: "Waiting on lenders", body: `${subs.filter((s) => ["submitted", "under_review", "info_requested"].includes(s.status)).length} submission(s) awaiting a response. Record each decision as it arrives.`, tone: "info", cta: { label: "Record lender responses", onClick: () => setTab("lenders") } };
      case "conditionally_approved":
        return { title: openConds ? `${openConds} condition${openConds === 1 ? "" : "s"} to resolve` : "Conditions resolved", body: "Resolve conditions to confirm approval, or add offers for lenders that approved outright.", tone: "warning", cta: { label: "View conditions", onClick: () => setTab("lenders") } };
      case "approved":
        return { title: "Approved — present offers", body: offers.length ? "Compare offers with the customer and record their choice." : "Add the lender's terms as an offer to calculate payment and total cost.", tone: "success", cta: offers.length ? { label: "Compare offers", onClick: () => setTab("offers"), icon: ArrowRight } : { label: "Add offer", onClick: () => setOfferOpen(true), icon: FilePlus2 } };
      case "offer_accepted":
        return { title: "Offer accepted", body: contractingErr ?? "Ready to move into contracting.", tone: contractingErr ? "warning" : "success", cta: { label: "Move to contracting", onClick: () => { const r = actions.changeStatus(app.id, "contracting"); if (r.ok) toast.success("Moved to Contracting"); }, disabled: !!contractingErr || !can("application.status") } };
      case "contracting":
        return { title: "In contracting", body: "Once the lender funds the deal, record it to update commissions and the dashboard.", tone: "info", cta: { label: "Mark funded", onClick: () => setFundOpen(true), disabled: !can("application.fund"), icon: Landmark } };
      case "funded":
        return { title: "Funded", body: `Funded ${formatDate(app.fundedAt)} for ${formatMoney(app.fundedAmount ?? 0, app.currency)}.`, tone: "success", cta: { label: "View commissions", onClick: () => router.push(`/commissions?application=${app.id}`) } };
      case "declined":
        return { title: "Declined by lenders", body: "Re-submit to other lenders or close the application.", tone: "warning", cta: canSubmit ? { label: "Try other lenders", onClick: () => setSubmitOpen(true), icon: Send } : undefined };
      default:
        return { title: meta.label, body: meta.description, tone: "info" };
    }
  }

  return (
    <>
      <PageHeader
        eyebrow={
          <span className="flex items-center gap-2">
            {app.id} {app.archived && <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-700">ARCHIVED</span>}
          </span>
        }
        title={customerDisplayName(customer)}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <AppStatusBadge status={app.status} />
            <span>
              {robotLabel(app)} · {FINANCING_TYPE_LABEL[app.financingType]} · {formatMoney(app.requestedAmount, app.currency)}
            </span>
          </span>
        }
        actions={
          <>
            <Button variant="outline" asChild disabled={!can("application.edit")}>
              <Link href={`/applications/${app.id}/edit`}>
                <Pencil /> Edit
              </Link>
            </Button>
            <StatusMenu app={app} onSpecial={(to) => (to === "submitted" ? setSubmitOpen(true) : setTab("offers"))} />
            <Button onClick={() => setSubmitOpen(true)} disabled={!canSubmit}>
              <Send /> Submit to lenders
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="More actions">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  disabled={!can("application.create")}
                  onSelect={() => {
                    const r = actions.duplicateApplication(app.id);
                    if (r.ok) {
                      toast.success(`Duplicated as ${r.value.id}`);
                      router.push(`/applications/${r.value.id}`);
                    }
                  }}
                >
                  <Copy /> Duplicate
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={!can("application.archive")} onSelect={() => setArchiveOpen(true)}>
                  {app.archived ? <Undo2 /> : <Archive />} {app.archived ? "Restore" : "Archive"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="mb-4 h-auto w-full flex-wrap justify-start">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="lenders">Lenders · {subs.length}</TabsTrigger>
              <TabsTrigger value="offers">Offers · {offers.length}</TabsTrigger>
              <TabsTrigger value="documents">
                Documents · {completeness.received}/{completeness.required}
              </TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
              <TabsTrigger value="emails">Emails</TabsTrigger>
            </TabsList>
            <TabsContent value="overview">
              <Overview app={app} />
            </TabsContent>
            <TabsContent value="lenders">
              <SubmissionsTab app={app} />
            </TabsContent>
            <TabsContent value="offers">
              <OffersTab app={app} />
            </TabsContent>
            <TabsContent value="documents">
              <DocumentsTab app={app} />
            </TabsContent>
            <TabsContent value="activity">
              <ActivityTab app={app} />
            </TabsContent>
            <TabsContent value="emails">
              <EmailsTab app={app} />
            </TabsContent>
          </Tabs>
        </div>

        <aside className="space-y-4">
          <section className={`rounded-xl border p-4 ${next.tone === "warning" ? "border-amber-200 bg-amber-50/60" : next.tone === "success" ? "border-emerald-200 bg-emerald-50/60" : "border-blue-200 bg-blue-50/50"}`}>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Next step</p>
            <p className="mt-1 font-medium">{next.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{next.body}</p>
            {next.cta && (
              <Button className="mt-3 w-full" onClick={next.cta.onClick} disabled={next.cta.disabled}>
                {next.cta.icon && <next.cta.icon />}
                {next.cta.label}
              </Button>
            )}
          </section>

          <SectionCard title="Assignment">
            <div className="flex items-center gap-2">
              <PersonAvatar name={data.employees.find((e) => e.id === app.assignedEmployeeId)?.name ?? "?"} className="size-8 text-xs" />
              <Select
                value={app.assignedEmployeeId}
                disabled={!can("application.edit")}
                onValueChange={(v) => {
                  const r = actions.assignApplications([app.id], v);
                  if (r.ok) toast.success("Reassigned");
                }}
              >
                <SelectTrigger className="flex-1" aria-label="Assigned employee">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {data.employees.filter((e) => e.active).map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Created {formatDate(app.createdAt)} · active {formatRelative(app.lastActivityAt)}
            </p>
          </SectionCard>

          <FollowUps app={app} />
          <Notes app={app} />
        </aside>
      </div>

      {submitOpen && <SubmitToLendersDialog app={app} open onOpenChange={setSubmitOpen} />}
      {fundOpen && <FundDialog app={app} open onOpenChange={setFundOpen} />}
      {offerOpen && <OfferDialog open onOpenChange={setOfferOpen} applicationId={app.id} />}
      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title={app.archived ? "Restore this application?" : "Archive this application?"}
        description={app.archived ? "It will reappear in the main lists." : "Archived applications are hidden from active lists and the pipeline but kept for reporting."}
        confirmLabel={app.archived ? "Restore" : "Archive"}
        onConfirm={() => {
          const r = actions.archiveApplication(app.id, !app.archived);
          if (r.ok) toast.success(app.archived ? "Application restored" : "Application archived");
        }}
      />
    </>
  );
}

function Overview({ app }: { app: FinancingApplication }) {
  const { data } = useStore();
  const customer = data.customers.find((c) => c.id === app.customerId);
  const subs = data.submissions.filter((s) => s.applicationId === app.id);
  const comms = data.commissions.filter((c) => c.applicationId === app.id && c.status !== "void");
  const accepted = app.acceptedOfferId ? data.offers.find((o) => o.id === app.acceptedOfferId) : undefined;
  const p = app.profile;
  return (
    <div className="space-y-4">
      {accepted && (
        <Callout tone="success" title="Accepted offer">
          {data.lenders.find((l) => l.id === accepted.lenderId)?.name} · {formatMoney(accepted.monthlyPayment, app.currency, { decimals: true })}/mo for {accepted.termMonths} months · total cost {formatMoney(accepted.totalCost, app.currency)}
        </Callout>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <SectionCard title="Customer" action={customer && <Button variant="ghost" size="xs" asChild><Link href={`/customers/${customer.id}`}>Open</Link></Button>}>
          <dl className="-my-1.5">
            <DataRow label="Name">{customerDisplayName(customer)}</DataRow>
            {customer?.type === "business" && <DataRow label="Contact">{customer.name}</DataRow>}
            <DataRow label="Type">{customer ? CUSTOMER_TYPE_LABEL[customer.type] : "—"}</DataRow>
            <DataRow label="Email">{customer?.email}</DataRow>
            <DataRow label="Phone">{customer?.phone}</DataRow>
            <DataRow label="Location">
              {customer?.region}, {customer?.country}
            </DataRow>
          </dl>
        </SectionCard>
        <SectionCard title="Robot">
          <dl className="-my-1.5">
            <DataRow label="Model">{robotLabel(app)}</DataRow>
            <DataRow label="Category">{ROBOT_CATEGORY_LABEL[app.robot.category]}</DataRow>
            <DataRow label="Condition / qty">
              {app.robot.condition} × {app.robot.quantity}
            </DataRow>
            <DataRow label="Unit price">{formatMoney(app.robot.unitPrice, app.currency)}</DataRow>
            <DataRow label="Install + shipping">{formatMoney(app.robot.installationCost + app.robot.shippingCost, app.currency)}</DataRow>
            <DataRow label="Purchase total">
              <strong>{formatMoney(app.purchaseTotal, app.currency)}</strong>
            </DataRow>
          </dl>
        </SectionCard>
        <SectionCard title="Financing request">
          <dl className="-my-1.5">
            <DataRow label="Structure">
              {FINANCING_TYPE_LABEL[app.financingType]} · {app.preferredTermMonths} mo · {app.currency}
            </DataRow>
            <DataRow label="Down payment">{formatMoney(app.downPayment, app.currency)}</DataRow>
            <DataRow label="Trade-in / credits">{formatMoney(app.tradeInCredit, app.currency)}</DataRow>
            <DataRow label="Requested financing">
              <strong>{formatMoney(app.requestedAmount, app.currency)}</strong>
            </DataRow>
            {app.desiredMonthlyPayment ? <DataRow label="Customer target">{formatMoney(app.desiredMonthlyPayment, app.currency)}/mo</DataRow> : null}
          </dl>
        </SectionCard>
        <SectionCard title="Financial profile">
          <dl className="-my-1.5">
            <DataRow label="Credit profile (est.)">{CREDIT_LABEL[p.credit]}</DataRow>
            {customer?.type === "business" ? (
              <>
                <DataRow label="Annual revenue">{p.annualRevenue !== undefined ? formatMoney(p.annualRevenue, app.currency) : "—"}</DataRow>
                <DataRow label="Years operating">{p.yearsOperating ?? "—"}</DataRow>
                <DataRow label="Ownership">{p.ownership ? OWNERSHIP_LABEL[p.ownership] : "—"}</DataRow>
              </>
            ) : (
              <>
                <DataRow label="Employment">{p.employment ? EMPLOYMENT_LABEL[p.employment] : "—"}</DataRow>
                <DataRow label="Annual income">{p.annualIncome !== undefined ? formatMoney(p.annualIncome, app.currency) : "—"}</DataRow>
              </>
            )}
          </dl>
        </SectionCard>
      </div>

      <SectionCard title="Lender status" description="Independent of the overall application status.">
        {subs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No submissions yet.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {subs.map((s) => {
              const l = data.lenders.find((x) => x.id === s.lenderId);
              return (
                <li key={s.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                  {l && <LenderAvatar lender={l} size="sm" />}
                  <span className="min-w-0 flex-1 truncate">{l?.name}</span>
                  <SubmissionBadge status={s.status} />
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      {comms.length > 0 && (
        <SectionCard title="Commissions" description="Rule-based, not derived from interest.">
          <ul className="divide-y">
            {comms.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span>
                  {COMMISSION_KIND_LABEL[c.kind]}
                  {c.employeeId && <span className="text-muted-foreground"> · {data.employees.find((e) => e.id === c.employeeId)?.name}</span>}
                </span>
                <span className="flex items-center gap-3">
                  <span className="tnum font-medium">{formatMoney(c.actual ?? c.estimated, c.currency, { decimals: true })}</span>
                  <CommissionBadge status={c.status} />
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}

function FollowUps({ app }: { app: FinancingApplication }) {
  const { data, actions, can, currentUser } = useStore();
  const tasks = data.tasks.filter((t) => t.applicationId === app.id).sort((a, b) => Number(a.done) - Number(b.done) || a.dueDate.localeCompare(b.dueDate));
  const [title, setTitle] = useState("");
  const [due, setDue] = useState(toDateInput(addDays(new Date(), data.settings.financingDefaults.followUpDays)));
  return (
    <SectionCard title="Follow-ups">
      <ul className="space-y-2">
        {tasks.map((t) => (
          <li key={t.id} className="group flex items-start gap-2 text-sm">
            <Checkbox checked={t.done} onCheckedChange={() => actions.toggleTask(t.id)} id={`t-${t.id}`} className="mt-0.5" />
            <label htmlFor={`t-${t.id}`} className="min-w-0 flex-1">
              <span className={t.done ? "text-muted-foreground line-through" : ""}>{t.title}</span>
              <span className={`block text-xs ${!t.done && new Date(t.dueDate) < new Date() ? "font-medium text-red-600" : "text-muted-foreground"}`}>Due {formatDate(t.dueDate)}</span>
            </label>
            <button type="button" onClick={() => actions.deleteTask(t.id)} aria-label={`Delete follow-up ${t.title}`} className="rounded p-1 text-muted-foreground opacity-0 hover:text-red-600 focus:opacity-100 group-hover:opacity-100">
              <Trash2 className="size-3.5" />
            </button>
          </li>
        ))}
        {tasks.length === 0 && <li className="text-xs text-muted-foreground">No follow-ups yet.</li>}
      </ul>
      <form
        className="mt-3 flex flex-col gap-2 border-t pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          const r = actions.addTask({ applicationId: app.id, customerId: app.customerId, kind: "internal", title, dueDate: fromDateInput(due), assigneeId: currentUser.id });
          if (r.ok) setTitle("");
        }}
      >
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a follow-up…" aria-label="New follow-up" disabled={!can("application.edit")} />
        <div className="flex gap-2">
          <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date" className="flex-1" />
          <Button type="submit" variant="outline" disabled={!title.trim()}>
            <CalendarPlus /> Add
          </Button>
        </div>
      </form>
    </SectionCard>
  );
}

function Notes({ app }: { app: FinancingApplication }) {
  const { data, actions, can } = useStore();
  const [body, setBody] = useState("");
  return (
    <SectionCard title="Internal notes">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const r = actions.addApplicationNote(app.id, body);
          if (r.ok) setBody("");
        }}
        className="space-y-2"
      >
        <Textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a note…" aria-label="New note" disabled={!can("application.edit")} />
        <Button type="submit" size="sm" variant="outline" disabled={!body.trim()}>
          <StickyNote /> Add note
        </Button>
      </form>
      <ul className="mt-3 space-y-3">
        {app.notes.map((n) => (
          <li key={n.id} className="text-sm">
            <p>{n.body}</p>
            <p className="text-xs text-muted-foreground">
              {data.employees.find((e) => e.id === n.authorId)?.name ?? "System"} · {formatRelative(n.createdAt)}
            </p>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
