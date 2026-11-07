"use client";

import { useState } from "react";
import { Columns3, FileText, Mail, Plus, ScrollText } from "lucide-react";
import { toast } from "sonner";
import { OfferDialog } from "@/components/applications/offer-dialog";
import { DocumentCard } from "@/components/documents/document-card";
import { EmailDialog, EmailListItem } from "@/components/emails/email-dialog";
import { ExpiryPill, OfferActionsMenu, OfferCompare } from "@/components/offers/offer-parts";
import { OfferBadge, SimulatedTag } from "@/components/shared/badges";
import { Callout, EmptyState, LenderAvatar } from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DOCUMENT_TYPE_LABEL, FINANCING_TYPE_LABEL } from "@/domain/labels";
import type { DocumentType, FinancingApplication } from "@/domain/types";
import { formatDate, formatDateTime, formatMoney, formatRelative } from "@/lib/format";
import { documentCompleteness, isOfferExpired } from "@/lib/selectors";
import { cn } from "@/lib/utils";
import { documentService } from "@/services/documents";
import { useStore } from "@/store/store";

/* ------------------------------- offers ------------------------------ */

export function OffersTab({ app }: { app: FinancingApplication }) {
  const { data, can } = useStore();
  const offers = data.offers.filter((o) => o.applicationId === app.id);
  const [sel, setSel] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);
  const [adding, setAdding] = useState(false);
  const hasSubs = data.submissions.some((s) => s.applicationId === app.id && s.status !== "withdrawn");
  const toggle = (id: string) => {
    setSel((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (cur.length >= 3) {
        toast.info("You can compare up to 3 offers at a time.");
        return cur;
      }
      return [...cur, id];
    });
    setComparing(false);
  };
  const selected = offers.filter((o) => sel.includes(o.id));
  const locked = ["funded", "closed"].includes(app.status);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Offers are entered from lender responses. Select 2–3 to compare side by side — no offer is ever ranked automatically.</p>
        <div className="flex gap-2">
          <Button variant="outline" disabled={selected.length < 2} onClick={() => setComparing(true)}>
            <Columns3 /> Compare{selected.length ? ` (${selected.length})` : ""}
          </Button>
          <Button onClick={() => setAdding(true)} disabled={!can("offer.manage") || locked || !hasSubs}>
            <Plus /> Add offer
          </Button>
        </div>
      </div>
      {!hasSubs && <Callout tone="info">Record a lender submission before adding offers.</Callout>}

      {comparing && selected.length >= 2 && <OfferCompare offers={selected} app={app} onClose={() => setComparing(false)} />}

      {offers.length === 0 ? (
        <div className="rounded-xl border border-dashed">
          <EmptyState icon={FileText} title="No offers yet" description="When a lender approves, add their terms here to calculate payments and total cost." />
        </div>
      ) : (
        <ul className="space-y-3">
          {offers.map((o) => {
            const lender = data.lenders.find((l) => l.id === o.lenderId);
            const expired = isOfferExpired(o);
            return (
              <li key={o.id} className={cn("rounded-xl border bg-card p-4", o.status === "accepted" && "border-emerald-300 bg-emerald-50/30", (o.status === "rejected" || o.status === "superseded" || expired) && "bg-muted/30")}>
                <div className="flex items-start gap-3">
                  <Checkbox checked={sel.includes(o.id)} onCheckedChange={() => toggle(o.id)} aria-label={`Select ${lender?.name} offer to compare`} className="mt-1" />
                  {lender && <LenderAvatar lender={lender} size="lg" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{lender?.name}</p>
                      <OfferBadge status={o.status} />
                      <ExpiryPill offer={o} />
                      <span className="text-xs text-muted-foreground">{FINANCING_TYPE_LABEL[o.product]}</span>
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
                      <Fact label="Monthly payment" value={formatMoney(o.monthlyPayment, app.currency, { decimals: true })} strong />
                      <Fact label="Term" value={`${o.termMonths} months`} />
                      <Fact label={o.product === "loan" ? "APR" : "Money factor"} value={o.product === "loan" ? `${(o.apr ?? 0).toFixed(2)}%` : (o.moneyFactor ?? 0).toFixed(5)} />
                      <Fact label="Due at signing" value={formatMoney(o.downPayment + o.fees, app.currency)} />
                      <Fact label="Approved amount" value={formatMoney(o.approvedAmount, app.currency)} />
                      <Fact label={o.product === "lease" ? "Total (excl. buyout)" : "Total cost"} value={formatMoney(o.totalCost, app.currency)} />
                      {o.product === "lease" && <Fact label="Residual" value={formatMoney(o.residualValue ?? 0, app.currency)} />}
                      <Fact label="Expires" value={formatDate(o.expiresAt)} />
                    </dl>
                    {o.conditions.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Conditions: {o.conditions.join("; ")}</p>}
                  </div>
                  <OfferActionsMenu offer={o} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {adding && <OfferDialog open onOpenChange={setAdding} applicationId={app.id} />}
    </div>
  );
}

function Fact({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("tnum", strong ? "text-base font-semibold" : "font-medium")}>{value}</dd>
    </div>
  );
}

/* ------------------------------ documents ---------------------------- */

const ADDABLE: DocumentType[] = ["lender_additional", "insurance", "financial_statements", "business_registration", "proof_of_income", "identification", "equipment_quotation", "purchase_agreement"];

export function DocumentsTab({ app }: { app: FinancingApplication }) {
  const { data, actions, can } = useStore();
  const docs = data.documents.filter((d) => d.applicationId === app.id);
  const c = documentCompleteness(docs);
  const [addType, setAddType] = useState<DocumentType>("lender_additional");
  const [emailOpen, setEmailOpen] = useState(false);
  const canEdit = can("application.edit");
  const canVerify = can("submission.manage") || can("application.status");
  return (
    <div className="space-y-4">
      <Callout tone="warning" title="Demo-only uploads">
        Files are not stored or transmitted. Only the name, size and type are kept for this prototype — use fictional documents. Production will use private storage with access controls.
      </Callout>
      <div className="rounded-xl border bg-card p-4">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-medium">Document completeness</span>
          <span className="tnum text-muted-foreground">
            {c.received}/{c.required} required received · {c.verified} verified
          </span>
        </div>
        <Progress value={c.percentReceived} className="h-2" aria-label="Documents received" />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">{c.missing.length ? `Outstanding: ${c.missing.map((m) => m.label).join(", ")}` : "All required documents received."}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={c.missing.length === 0} onClick={() => setEmailOpen(true)}>
              <Mail /> Request missing documents
            </Button>
            <Select value={addType} onValueChange={(v) => setAddType(v as DocumentType)}>
              <SelectTrigger size="sm" className="w-48" aria-label="Requirement type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ADDABLE.map((t) => (
                  <SelectItem key={t} value={t}>
                    {DOCUMENT_TYPE_LABEL[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" disabled={!canEdit} onClick={() => actions.addDocumentRequirement(app.id, addType)}>
              <Plus /> Add requirement
            </Button>
          </div>
        </div>
      </div>
      <div className="space-y-2.5">
        {docs.map((d) => (
          <DocumentCard
            key={d.id}
            doc={d}
            canManage={canEdit}
            canVerify={canVerify}
            onAttach={async (meta, file) => {
              const r = actions.attachDocument(d.id, meta);
              if (r.ok && file) await documentService.upload(d.id, file);
            }}
            onSetStatus={(status, note) => {
              if (status === "missing") documentService.remove(d.id);
              actions.setDocumentStatus(d.id, status, note);
            }}
            onToggleChecklist={(itemId) => actions.toggleChecklistItem(d.id, itemId)}
          />
        ))}
      </div>
      {emailOpen && <EmailDialog open onOpenChange={setEmailOpen} applicationId={app.id} templateId={data.settings.templates.find((t) => /document/i.test(t.name))?.id} />}
    </div>
  );
}

/* ------------------------------ activity ----------------------------- */

export function ActivityTab({ app }: { app: FinancingApplication }) {
  const { data } = useStore();
  const events = data.activity.filter((a) => a.applicationId === app.id).sort((a, b) => b.at.localeCompare(a.at));
  if (!events.length) return <EmptyState icon={ScrollText} title="No activity yet" />;
  return (
    <ol className="relative space-y-4 border-l pl-5">
      {events.map((e) => (
        <li key={e.id} className="relative">
          <span className="absolute -left-[25px] top-1.5 size-2 rounded-full bg-primary/50 ring-4 ring-background" />
          <p className="text-sm">
            {e.message} {e.simulated && <SimulatedTag className="ml-1 align-middle" />}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatDateTime(e.at)} · {formatRelative(e.at)} · {data.employees.find((x) => x.id === e.actorId)?.name ?? "System"}
          </p>
        </li>
      ))}
    </ol>
  );
}

/* ------------------------------- emails ------------------------------ */

export function EmailsTab({ app }: { app: FinancingApplication }) {
  const { data } = useStore();
  const [open, setOpen] = useState(false);
  const emails = data.emails.filter((e) => e.applicationId === app.id);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Drafts and simulated sends for this application. No real email is ever sent.</p>
        <Button onClick={() => setOpen(true)}>
          <Mail /> Compose email
        </Button>
      </div>
      {emails.length === 0 ? (
        <div className="rounded-xl border border-dashed">
          <EmptyState icon={Mail} title="No emails yet" description="Compose a customer update or a lender follow-up from a template." />
        </div>
      ) : (
        <ul className="space-y-2">
          {emails.map((e) => (
            <EmailListItem key={e.id} email={e} />
          ))}
        </ul>
      )}
      {open && <EmailDialog open onOpenChange={setOpen} applicationId={app.id} />}
    </div>
  );
}
