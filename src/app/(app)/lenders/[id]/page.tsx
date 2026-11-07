"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Mail, Pencil, Phone, Plus, Power, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ContactDialog, LenderDialog, ProgramDialog, SimulationNote } from "@/components/lenders/lender-dialogs";
import { AppStatusBadge, IntegrationBadge, OfferBadge, Pill, SubmissionBadge } from "@/components/shared/badges";
import { ConfirmDialog, DataRow, EmptyState, Field, KpiCard, PageHeader, SectionCard } from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { CREDIT_LABEL, CUSTOMER_TYPE_LABEL, DOCUMENT_TYPE_LABEL, FINANCING_TYPE_LABEL, INTEGRATION_LABEL, ROBOT_CATEGORY_LABEL } from "@/domain/labels";
import type { IntegrationMethod, Lender, LenderContact, LenderProgram } from "@/domain/types";
import { formatDate, formatMoney, formatPercent } from "@/lib/format";
import { lenderStats } from "@/lib/metrics";
import { customerDisplayName } from "@/lib/selectors";
import { useStore } from "@/store/store";

const TABS = ["overview", "programs", "requirements", "applications", "offers", "contacts", "settings"] as const;

export default function LenderDetailPage() {
  return (
    <Suspense fallback={null}>
      <Page />
    </Suspense>
  );
}

function Page() {
  const { id } = useParams<{ id: string }>();
  const { data } = useStore();
  const lender = data.lenders.find((l) => l.id === id);
  if (!lender) {
    return (
      <div className="rounded-xl border bg-card">
        <EmptyState title="Lender not found" action={<Button asChild><Link href="/lenders">Back to lenders</Link></Button>} />
      </div>
    );
  }
  return <Detail lender={lender} />;
}

function Detail({ lender }: { lender: Lender }) {
  const { data, actions, can } = useStore();
  const router = useRouter();
  const params = useSearchParams();
  const t = params.get("tab");
  const tab = (TABS as readonly string[]).includes(t ?? "") ? (t as string) : "overview";
  const [editing, setEditing] = useState(false);
  const manage = can("lender.manage");
  const stat = lenderStats(data, data.applications.filter((a) => !a.archived)).find((s) => s.lenderId === lender.id);
  const programs = data.programs.filter((p) => p.lenderId === lender.id);
  const subs = data.submissions.filter((s) => s.lenderId === lender.id);
  const offers = data.offers.filter((o) => o.lenderId === lender.id);

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/lenders" className="hover:underline">
            Lenders
          </Link>
        }
        title={lender.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <IntegrationBadge method={lender.integration} />
            {!lender.active && <Pill tone="neutral">Inactive</Pill>}
            <span>
              {lender.countries.join(" · ")} · {lender.products.map((p) => FINANCING_TYPE_LABEL[p]).join(" & ")}
            </span>
          </span>
        }
        actions={
          <>
            <Button variant="outline" onClick={() => setEditing(true)} disabled={!manage}>
              <Pencil /> Edit profile
            </Button>
            <Button variant="outline" onClick={() => { const r = actions.setLenderActive(lender.id, !lender.active); if (r.ok) toast.success(lender.active ? "Lender deactivated" : "Lender activated"); }} disabled={!manage}>
              <Power /> {lender.active ? "Deactivate" : "Activate"}
            </Button>
          </>
        }
      />
      <Tabs value={tab} onValueChange={(v) => router.replace(`/lenders/${lender.id}?tab=${v}`, { scroll: false })}>
        <TabsList className="mb-4 h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="programs">Financing Programs · {programs.length}</TabsTrigger>
          <TabsTrigger value="requirements">Requirements</TabsTrigger>
          <TabsTrigger value="applications">Applications · {new Set(subs.map((s) => s.applicationId)).size}</TabsTrigger>
          <TabsTrigger value="offers">Offers · {offers.length}</TabsTrigger>
          <TabsTrigger value="contacts">Contacts · {lender.contacts.length}</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Submissions" value={stat?.submissions ?? 0} sub={`${stat?.pending ?? 0} pending`} />
            <KpiCard label="Approval rate" value={stat?.approvalRate != null ? formatPercent(stat.approvalRate * 100, 0) : "—"} sub="approved + conditional ÷ decided" />
            <KpiCard label="Avg. turnaround" value={stat?.avgTurnaroundDays != null ? `${stat.avgTurnaroundDays.toFixed(1)}d` : "—"} sub={`profile: ~${lender.turnaroundDays}d`} />
            <KpiCard label="Funded volume" value={formatMoney(stat?.fundedVolumeUsd ?? 0, "USD", { compact: true })} sub={`${stat?.fundedDeals ?? 0} deals (USD eq.)`} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <SectionCard title="Profile">
              <dl className="-my-1.5">
                <DataRow label="Customer types">{lender.customerTypes.map((c) => CUSTOMER_TYPE_LABEL[c]).join(", ")}</DataRow>
                <DataRow label="Currencies">{lender.currencies.join(", ")}</DataRow>
                <DataRow label="Amount range">
                  {formatMoney(lender.minAmount, lender.currencies[0]!)} – {formatMoney(lender.maxAmount, lender.currencies[0]!)}
                </DataRow>
                <DataRow label="Terms">{lender.terms.join(", ")} mo</DataRow>
                <DataRow label="Indicative rate">
                  {lender.aprMin}% – {lender.aprMax}%
                </DataRow>
                <DataRow label="Robot categories">{lender.robotCategories.map((c) => ROBOT_CATEGORY_LABEL[c]).join(", ")}</DataRow>
              </dl>
            </SectionCard>
            <SectionCard title="Commission arrangement" description="Dealer fees are fixed by agreement, not derived from interest.">
              <dl className="-my-1.5">
                <DataRow label="Dealer fee">{lender.commission.dealerFeePercent}% of funded amount</DataRow>
                <DataRow label="Flat financing fee">{formatMoney(lender.commission.financingFeeFlat, "USD")} per funded deal</DataRow>
              </dl>
              {lender.commission.notes && <p className="mt-2 text-xs text-muted-foreground">{lender.commission.notes}</p>}
            </SectionCard>
          </div>
          {lender.notes && (
            <SectionCard title="Internal notes">
              <p className="text-sm">{lender.notes}</p>
            </SectionCard>
          )}
        </TabsContent>

        <TabsContent value="programs">
          <ProgramsTab lender={lender} programs={programs} manage={manage} />
        </TabsContent>

        <TabsContent value="requirements" className="grid gap-4 md:grid-cols-2">
          <SectionCard title="Eligibility criteria" description="Used by mock screening.">
            <dl className="-my-1.5">
              <DataRow label="Minimum credit profile">{CREDIT_LABEL[lender.minCredit]}</DataRow>
              <DataRow label="Min. years in business">{lender.minYearsInBusiness}</DataRow>
              <DataRow label="Min. annual revenue">{lender.minAnnualRevenue ? formatMoney(lender.minAnnualRevenue, lender.currencies[0]!) : "None"}</DataRow>
            </dl>
            {lender.creditRequirements && <p className="mt-2 text-sm text-muted-foreground">{lender.creditRequirements}</p>}
          </SectionCard>
          <SectionCard title="Required documents">
            <ul className="space-y-1.5 text-sm">
              {lender.requiredDocuments.map((d) => (
                <li key={d} className="flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-primary/50" />
                  {DOCUMENT_TYPE_LABEL[d]}
                </li>
              ))}
              {lender.requiredDocuments.length === 0 && <li className="text-muted-foreground">No specific documents listed.</li>}
            </ul>
          </SectionCard>
          <SectionCard title="Submission instructions" className="md:col-span-2">
            <p className="text-sm">{lender.submissionInstructions || "None recorded."}</p>
          </SectionCard>
        </TabsContent>

        <TabsContent value="applications">
          <SectionCard flush>
            {subs.length === 0 ? (
              <EmptyState title="No submissions yet" description="Submissions to this lender will appear here." />
            ) : (
              <div className="overflow-x-auto">
                <Table className="min-w-[720px] text-[13px]">
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="text-xs">Application</TableHead>
                      <TableHead className="text-xs">Applicant</TableHead>
                      <TableHead className="text-right text-xs">Requested</TableHead>
                      <TableHead className="text-xs">Lender status</TableHead>
                      <TableHead className="text-xs">App status</TableHead>
                      <TableHead className="text-xs">Submitted</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {subs.map((s) => {
                      const a = data.applications.find((x) => x.id === s.applicationId);
                      if (!a) return null;
                      return (
                        <TableRow key={s.id}>
                          <TableCell>
                            <Link href={`/applications/${a.id}?tab=lenders`} className="font-mono text-xs text-primary hover:underline">
                              {a.id}
                            </Link>
                          </TableCell>
                          <TableCell>{customerDisplayName(data.customers.find((c) => c.id === a.customerId))}</TableCell>
                          <TableCell className="tnum text-right">{formatMoney(a.requestedAmount, a.currency)}</TableCell>
                          <TableCell>
                            <SubmissionBadge status={s.status} />
                          </TableCell>
                          <TableCell>
                            <AppStatusBadge status={a.status} />
                          </TableCell>
                          <TableCell className="text-muted-foreground">{formatDate(s.submittedAt)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="offers">
          <SectionCard flush>
            {offers.length === 0 ? (
              <EmptyState title="No offers from this lender" />
            ) : (
              <div className="overflow-x-auto">
                <Table className="min-w-[720px] text-[13px]">
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="text-xs">Application</TableHead>
                      <TableHead className="text-xs">Product</TableHead>
                      <TableHead className="text-right text-xs">Amount</TableHead>
                      <TableHead className="text-right text-xs">Payment</TableHead>
                      <TableHead className="text-xs">Term</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {offers.map((o) => {
                      const a = data.applications.find((x) => x.id === o.applicationId);
                      return (
                        <TableRow key={o.id}>
                          <TableCell>
                            <Link href={`/applications/${o.applicationId}?tab=offers`} className="font-mono text-xs text-primary hover:underline">
                              {o.applicationId}
                            </Link>
                          </TableCell>
                          <TableCell>{FINANCING_TYPE_LABEL[o.product]}</TableCell>
                          <TableCell className="tnum text-right">{formatMoney(o.approvedAmount, a?.currency ?? "USD")}</TableCell>
                          <TableCell className="tnum text-right">{formatMoney(o.monthlyPayment, a?.currency ?? "USD", { decimals: true })}</TableCell>
                          <TableCell>{o.termMonths} mo</TableCell>
                          <TableCell>
                            <OfferBadge status={o.status} />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="contacts">
          <ContactsTab lender={lender} manage={manage} />
        </TabsContent>

        <TabsContent value="settings">
          <SettingsTab lender={lender} manage={manage} />
        </TabsContent>
      </Tabs>
      {editing && <LenderDialog open onOpenChange={setEditing} lender={lender} />}
    </>
  );
}

function ProgramsTab({ lender, programs, manage }: { lender: Lender; programs: LenderProgram[]; manage: boolean }) {
  const { actions } = useStore();
  const [edit, setEdit] = useState<LenderProgram | "new" | null>(null);
  const [del, setDel] = useState<LenderProgram | null>(null);
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button onClick={() => setEdit("new")} disabled={!manage}>
          <Plus /> Add program
        </Button>
      </div>
      {programs.length === 0 ? (
        <div className="rounded-xl border border-dashed">
          <EmptyState title="No programs yet" description="Programs describe the specific loan or lease products this lender offers." />
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {programs.map((p) => (
            <li key={p.id} className="rounded-xl border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.description}</p>
                </div>
                <Pill tone={p.active ? "success" : "neutral"}>{p.active ? "Active" : "Inactive"}</Pill>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                <div><dt className="text-muted-foreground">Product</dt><dd className="font-medium">{FINANCING_TYPE_LABEL[p.product]}</dd></div>
                <div><dt className="text-muted-foreground">Customers</dt><dd className="font-medium">{p.customerTypes.map((c) => CUSTOMER_TYPE_LABEL[c]).join(", ")}</dd></div>
                <div><dt className="text-muted-foreground">Amount</dt><dd className="tnum font-medium">{formatMoney(p.minAmount, lender.currencies[0]!, { compact: true })} – {formatMoney(p.maxAmount, lender.currencies[0]!, { compact: true })}</dd></div>
                <div><dt className="text-muted-foreground">Rate</dt><dd className="tnum font-medium">{p.aprMin}–{p.aprMax}%</dd></div>
                <div><dt className="text-muted-foreground">Terms</dt><dd className="font-medium">{p.terms.join(", ")} mo</dd></div>
                <div><dt className="text-muted-foreground">Min. credit</dt><dd className="font-medium">{CREDIT_LABEL[p.minCredit]}</dd></div>
                {p.product === "lease" && p.residualMinPercent !== undefined && <div><dt className="text-muted-foreground">Residual</dt><dd className="font-medium">{p.residualMinPercent}–{p.residualMaxPercent}%</dd></div>}
              </dl>
              <div className="mt-3 flex gap-2 border-t pt-3">
                <Button variant="outline" size="sm" onClick={() => setEdit(p)} disabled={!manage}><Pencil /> Edit</Button>
                <Button variant="ghost" size="sm" onClick={() => actions.saveProgram({ ...p, active: !p.active })} disabled={!manage}><Power /> {p.active ? "Deactivate" : "Activate"}</Button>
                <Button variant="ghost" size="sm" className="ml-auto text-red-600" onClick={() => setDel(p)} disabled={!manage}><Trash2 /> Delete</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {edit && <ProgramDialog open onOpenChange={(o) => !o && setEdit(null)} lender={lender} program={edit === "new" ? undefined : edit} />}
      <ConfirmDialog open={!!del} onOpenChange={(o) => !o && setDel(null)} title={`Delete “${del?.name}”?`} description="Existing submissions are unaffected." confirmLabel="Delete" destructive onConfirm={() => del && actions.deleteProgram(del.id)} />
    </div>
  );
}

function ContactsTab({ lender, manage }: { lender: Lender; manage: boolean }) {
  const { actions } = useStore();
  const [edit, setEdit] = useState<LenderContact | "new" | null>(null);
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button onClick={() => setEdit("new")} disabled={!manage}><Plus /> Add contact</Button>
      </div>
      {lender.contacts.length === 0 ? (
        <div className="rounded-xl border border-dashed"><EmptyState title="No contacts" description="Add a rep so submissions can name who they were sent to." /></div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {lender.contacts.map((c) => (
            <li key={c.id} className="flex items-start gap-3 rounded-xl border bg-card p-4">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 font-medium">{c.name} {c.primary && <Pill tone="teal"><Star className="size-3" /> Primary</Pill>}</p>
                <p className="text-xs text-muted-foreground">{c.title}</p>
                <p className="mt-2 flex items-center gap-1.5 text-sm"><Mail className="size-3.5 text-muted-foreground" />{c.email}</p>
                <p className="mt-1 flex items-center gap-1.5 text-sm"><Phone className="size-3.5 text-muted-foreground" />{c.phone}</p>
              </div>
              <div className="flex flex-col gap-1">
                <Button variant="ghost" size="icon-sm" aria-label={`Edit ${c.name}`} onClick={() => setEdit(c)} disabled={!manage}><Pencil /></Button>
                <Button variant="ghost" size="icon-sm" aria-label={`Remove ${c.name}`} className="text-red-600" disabled={!manage} onClick={() => actions.saveLender({ ...lender, contacts: lender.contacts.filter((x) => x.id !== c.id) })}><Trash2 /></Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {edit && <ContactDialog open onOpenChange={(o) => !o && setEdit(null)} lender={lender} contact={edit === "new" ? undefined : edit} />}
    </div>
  );
}

function SettingsTab({ lender, manage }: { lender: Lender; manage: boolean }) {
  const { actions } = useStore();
  const [integration, setIntegration] = useState<IntegrationMethod>(lender.integration);
  const [dealer, setDealer] = useState(String(lender.commission.dealerFeePercent));
  const [flat, setFlat] = useState(String(lender.commission.financingFeeFlat));
  const [cnotes, setCnotes] = useState(lender.commission.notes);
  const [instr, setInstr] = useState(lender.submissionInstructions);
  const dirty = integration !== lender.integration || dealer !== String(lender.commission.dealerFeePercent) || flat !== String(lender.commission.financingFeeFlat) || cnotes !== lender.commission.notes || instr !== lender.submissionInstructions;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <SectionCard title="Integration">
        <SimulationNote />
        <div className="mt-3 space-y-3">
          <Field label="Method">
            {(id) => (
              <Select value={integration} onValueChange={(v) => setIntegration(v as IntegrationMethod)} disabled={!manage}>
                <SelectTrigger id={id} className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(INTEGRATION_LABEL) as IntegrationMethod[]).map((m) => <SelectItem key={m} value={m}>{INTEGRATION_LABEL[m]}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </Field>
          <Field label="Submission instructions">{(id) => <Textarea id={id} rows={3} value={instr} onChange={(e) => setInstr(e.target.value)} disabled={!manage} />}</Field>
        </div>
      </SectionCard>
      <SectionCard title="Commission arrangement">
        <div className="space-y-3">
          <Field label="Dealer fee (% of funded amount)">{(id) => <Input id={id} inputMode="decimal" value={dealer} onChange={(e) => setDealer(e.target.value)} disabled={!manage} />}</Field>
          <Field label="Flat financing fee per funded deal">{(id) => <Input id={id} inputMode="decimal" value={flat} onChange={(e) => setFlat(e.target.value)} disabled={!manage} />}</Field>
          <Field label="Notes">{(id) => <Input id={id} value={cnotes} onChange={(e) => setCnotes(e.target.value)} disabled={!manage} />}</Field>
        </div>
      </SectionCard>
      <div className="md:col-span-2">
        <Button
          disabled={!manage || !dirty}
          onClick={() => {
            const d = Number(dealer);
            const f = Number(flat);
            if (!(d >= 0 && d <= 10) || !(f >= 0)) return void toast.error("Dealer fee must be 0–10% and flat fee 0 or more.");
            const r = actions.saveLender({ ...lender, integration, submissionInstructions: instr, commission: { dealerFeePercent: d, financingFeeFlat: f, notes: cnotes } });
            if (r.ok) toast.success("Lender settings saved", { description: "New rules apply to future estimated commissions." });
          }}
        >
          Save settings
        </Button>
      </div>
    </div>
  );
}
