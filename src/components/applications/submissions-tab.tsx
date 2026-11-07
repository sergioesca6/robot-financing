"use client";

import { useState } from "react";
import { CalendarClock, ChevronDown, ClipboardCheck, Plus, Send } from "lucide-react";
import { toast } from "sonner";
import { OfferDialog } from "@/components/applications/offer-dialog";
import { SubmitToLendersDialog } from "@/components/applications/submit-dialog";
import { IntegrationBadge, SimulatedTag, SubmissionBadge } from "@/components/shared/badges";
import { Callout, EmptyState, Field, LenderAvatar } from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SUBMISSION_METHOD_LABEL } from "@/domain/labels";
import { SUBMISSION_STATUS_META, SUBMITTABLE_STATUSES } from "@/domain/status";
import type { FinancingApplication, LenderSubmission, SubmissionStatus } from "@/domain/types";
import { formatDate, formatDateTime, formatMoney, fromDateInput, toDateInput } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useStore } from "@/store/store";

const DECISION_STATUSES: SubmissionStatus[] = ["submitted", "under_review", "info_requested", "conditionally_approved", "approved", "declined", "withdrawn"];

const num = (v: string): number | undefined => (v.trim() === "" || Number.isNaN(Number(v)) ? undefined : Number(v));

export function SubmissionsTab({ app }: { app: FinancingApplication }) {
  const { data, can } = useStore();
  const subs = data.submissions.filter((s) => s.applicationId === app.id);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [decision, setDecision] = useState<LenderSubmission | null>(null);
  const [offerFor, setOfferFor] = useState<string | null>(null);
  const manage = can("submission.manage");
  const locked = ["offer_accepted", "contracting", "funded", "closed"].includes(app.status);
  const canSubmit = manage && SUBMITTABLE_STATUSES.includes(app.status);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Each lender has its own status. The application status updates from the combined picture — it never moves backwards after an offer is accepted.
        </p>
        <Button onClick={() => setSubmitOpen(true)} disabled={!canSubmit}>
          <Send /> Submit to lenders
        </Button>
      </div>
      {!canSubmit && app.status !== "funded" && (
        <Callout tone="info">
          {!manage ? "Submitting to lenders isn't available for your demo role." : app.status === "needs_documents" || app.status === "draft" ? "Complete the application and required documents (status: Ready to Submit) before submitting to lenders." : `Submissions are closed for applications in this status.`}
        </Callout>
      )}

      {subs.length === 0 ? (
        <div className="rounded-xl border border-dashed">
          <EmptyState icon={Send} title="No lender submissions yet" description="Use Submit to lenders to review mock screening results and record where you sent this application." />
        </div>
      ) : (
        <ul className="space-y-3">
          {subs.map((s) => (
            <SubmissionCard key={s.id} s={s} app={app} manage={manage} locked={locked} onDecision={() => setDecision(s)} onAddOffer={() => setOfferFor(s.lenderId)} />
          ))}
        </ul>
      )}

      {submitOpen && <SubmitToLendersDialog app={app} open onOpenChange={setSubmitOpen} />}
      {decision && <DecisionDialog key={decision.id} sub={decision} app={app} locked={locked} onClose={() => setDecision(null)} />}
      {offerFor && <OfferDialog open onOpenChange={(o) => !o && setOfferFor(null)} applicationId={app.id} seed={{ lenderId: offerFor }} />}
    </div>
  );
}

function SubmissionCard({ s, app, manage, locked, onDecision, onAddOffer }: { s: LenderSubmission; app: FinancingApplication; manage: boolean; locked: boolean; onDecision: () => void; onAddOffer: () => void }) {
  const { data, actions, can } = useStore();
  const lender = data.lenders.find((l) => l.id === s.lenderId);
  const [showHistory, setShowHistory] = useState(false);
  if (!lender) return null;
  const offers = data.offers.filter((o) => o.submissionId === s.id || (o.applicationId === app.id && o.lenderId === s.lenderId));
  const open = s.conditions.filter((c) => !c.resolved).length;
  const canOffer = can("offer.manage") && ["approved", "conditionally_approved"].includes(s.status) && !locked;
  return (
    <li className={cn("rounded-xl border bg-card", ["declined", "withdrawn"].includes(s.status) && "bg-muted/30")}>
      <div className="flex flex-wrap items-start gap-3 p-4">
        <LenderAvatar lender={lender} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{lender.name}</p>
            <SubmissionBadge status={s.status} />
            <IntegrationBadge method={lender.integration} />
            <SimulatedTag />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {SUBMISSION_METHOD_LABEL[s.method]} · {s.referenceNumber ? `Ref ${s.referenceNumber}` : "No reference recorded"} · {s.contactPerson || "No contact specified"}
          </p>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
            <span>Submitted {formatDate(s.submittedAt)}</span>
            {s.decisionAt && <span>Decision {formatDate(s.decisionAt)}</span>}
            {s.followUpDate && !s.decisionAt && (
              <span className="inline-flex items-center gap-1">
                <CalendarClock className="size-3" /> Follow up {formatDate(s.followUpDate)}
              </span>
            )}
          </div>
          {s.offeredTerms && (s.offeredTerms.amount || s.offeredTerms.apr !== undefined) && (
            <p className="mt-2 rounded-md bg-muted/60 px-2.5 py-1.5 text-xs">
              Indicated terms:{" "}
              {[s.offeredTerms.amount ? formatMoney(s.offeredTerms.amount, app.currency) : null, s.offeredTerms.apr !== undefined ? `${s.offeredTerms.apr}% APR` : null, s.offeredTerms.termMonths ? `${s.offeredTerms.termMonths} mo` : null]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
          {s.notes && <p className="mt-2 text-xs text-muted-foreground">{s.notes}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {canOffer && offers.every((o) => o.status !== "active") && (
            <Button variant="outline" size="sm" onClick={onAddOffer}>
              <Plus /> Add offer
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onDecision} disabled={!manage}>
            <ClipboardCheck /> Record update
          </Button>
        </div>
      </div>

      {s.conditions.length > 0 && (
        <div className="border-t px-4 py-3">
          <p className="mb-2 text-xs font-medium">
            Conditions {open > 0 ? <span className="text-amber-700">· {open} open</span> : <span className="text-emerald-700">· all resolved</span>}
          </p>
          <ul className="space-y-1.5">
            {s.conditions.map((c) => (
              <li key={c.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  id={`cond-${c.id}`}
                  checked={c.resolved}
                  disabled={!manage || locked}
                  onCheckedChange={(v) => {
                    const r = actions.setConditionResolved(s.id, c.id, v === true);
                    if (r.ok && v === true && s.conditions.filter((x) => !x.resolved).length === 1 && s.status === "conditionally_approved") toast.success("All conditions resolved — lender approval confirmed");
                  }}
                />
                <label htmlFor={`cond-${c.id}`} className={cn(c.resolved && "text-muted-foreground line-through")}>
                  {c.text}
                </label>
                {c.resolvedAt && <span className="text-xs text-muted-foreground">resolved {formatDate(c.resolvedAt)}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="border-t">
        <button type="button" onClick={() => setShowHistory((v) => !v)} aria-expanded={showHistory} className="flex w-full items-center justify-between px-4 py-2 text-xs text-muted-foreground hover:bg-muted/40">
          <span>History ({s.history.length})</span>
          <ChevronDown className={cn("size-3.5 transition-transform", showHistory && "rotate-180")} />
        </button>
        {showHistory && (
          <ol className="space-y-2 px-4 pb-3">
            {[...s.history].reverse().map((h) => (
              <li key={h.id} className="flex gap-2 text-xs">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary/40" />
                <div>
                  <span className="font-medium">{SUBMISSION_STATUS_META[h.status].label}</span> <span className="text-muted-foreground">· {formatDateTime(h.at)} · {data.employees.find((e) => e.id === h.actorId)?.name ?? "System"}</span>
                  <p className="text-muted-foreground">{h.note}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </li>
  );
}

function DecisionDialog({ sub, app, locked, onClose }: { sub: LenderSubmission; app: FinancingApplication; locked: boolean; onClose: () => void }) {
  const { data, actions } = useStore();
  const lender = data.lenders.find((l) => l.id === sub.lenderId)!;
  const [status, setStatus] = useState<SubmissionStatus>(sub.status);
  const [note, setNote] = useState("");
  const [conds, setConds] = useState("");
  const [amount, setAmount] = useState(String(sub.offeredTerms?.amount ?? ""));
  const [apr, setApr] = useState(String(sub.offeredTerms?.apr ?? ""));
  const [term, setTerm] = useState(String(sub.offeredTerms?.termMonths ?? ""));
  const [ref, setRef] = useState(sub.referenceNumber);
  const [follow, setFollow] = useState(toDateInput(sub.followUpDate));
  const [notes, setNotes] = useState(sub.notes);
  const showTerms = status === "approved" || status === "conditionally_approved";
  const hasOpenConditions = sub.conditions.some((c) => !c.resolved);

  const save = () => {
    const addConditions = conds.split("\n").map((c) => c.trim()).filter(Boolean);
    const offered = showTerms && (num(amount) || num(apr) !== undefined || num(term)) ? { amount: num(amount), apr: num(apr), termMonths: num(term) } : undefined;
    const res = actions.updateSubmission(sub.id, {
      status: status !== sub.status ? status : undefined,
      note: note.trim() || undefined,
      referenceNumber: ref,
      followUpDate: follow ? fromDateInput(follow) : null,
      notes,
      addConditions: addConditions.length ? addConditions : undefined,
      offeredTerms: offered,
    });
    if (res.ok) {
      toast.success(`${lender.name} updated`);
      onClose();
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Record update — {lender.name}</DialogTitle>
          <DialogDescription>Log what the lender told you. This is a manual record; nothing is sent to the lender.</DialogDescription>
        </DialogHeader>
        {locked && <Callout tone="info">This application has an accepted offer, so lender decision statuses are locked. You can still edit reference, follow-up and notes.</Callout>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Lender status" className="sm:col-span-2">
            {(id) => (
              <Select value={status} onValueChange={(v) => setStatus(v as SubmissionStatus)} disabled={locked}>
                <SelectTrigger id={id} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DECISION_STATUSES.map((st) => (
                    <SelectItem key={st} value={st}>
                      {SUBMISSION_STATUS_META[st].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
          {status === "approved" && hasOpenConditions && <Callout tone="warning">Resolve all conditions first — otherwise keep this as a conditional approval.</Callout>}
          {status === "conditionally_approved" && (
            <Field label="Conditions (one per line)" className="sm:col-span-2" hint={sub.conditions.length ? `${sub.conditions.length} existing condition(s) will be kept.` : "At least one is required."}>
              {(id) => <Textarea id={id} rows={3} value={conds} onChange={(e) => setConds(e.target.value)} placeholder="e.g. Provide 2 most recent bank statements" />}
            </Field>
          )}
          {showTerms && (
            <>
              <Field label={`Indicated amount (${app.currency})`}>{(id) => <Input id={id} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />}</Field>
              <Field label="Indicated APR (%)">{(id) => <Input id={id} inputMode="decimal" value={apr} onChange={(e) => setApr(e.target.value)} />}</Field>
              <Field label="Indicated term (months)">{(id) => <Input id={id} inputMode="numeric" value={term} onChange={(e) => setTerm(e.target.value)} />}</Field>
            </>
          )}
          <Field label="Update note" className="sm:col-span-2">
            {(id) => <Input id={id} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did the lender say?" />}
          </Field>
          <Field label="Reference number">{(id) => <Input id={id} value={ref} onChange={(e) => setRef(e.target.value)} />}</Field>
          <Field label="Follow-up date">{(id) => <Input id={id} type="date" value={follow} onChange={(e) => setFollow(e.target.value)} />}</Field>
          <Field label="Submission notes" className="sm:col-span-2">
            {(id) => <Textarea id={id} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />}
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Save update</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
