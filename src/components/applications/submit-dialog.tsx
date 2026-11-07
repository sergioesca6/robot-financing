"use client";

import { useMemo, useState } from "react";
import { Check, Loader2, Send, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { LenderMatchList } from "@/components/applications/lender-matches";
import { IntegrationBadge, SimulatedTag } from "@/components/shared/badges";
import { Callout, LenderAvatar } from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SUBMISSION_METHOD_LABEL } from "@/domain/labels";
import type { FinancingApplication, SubmissionMethod } from "@/domain/types";
import { addDays, fromDateInput, toDateInput } from "@/lib/format";
import { matchInputFromApplication, matchLenders } from "@/lib/matching";
import { documentsFor } from "@/lib/selectors";
import type { SubmissionEntry } from "@/lib/workflow";
import { adapterFor } from "@/services/lender-adapter";
import { useStore } from "@/store/store";

interface Draft {
  method: SubmissionMethod;
  referenceNumber: string;
  contactPerson: string;
  submittedAt: string;
  followUpDate: string;
  notes: string;
}

/**
 * Submit-to-Lenders workflow. NOTHING is transmitted: manual lenders get a
 * "Record Manual Submission" entry, API-labelled lenders get a simulated receipt.
 */
export function SubmitToLendersDialog({ app, open, onOpenChange }: { app: FinancingApplication; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data, actions } = useStore();
  const customer = data.customers.find((c) => c.id === app.customerId)!;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const openLenderIds = new Set(
    data.submissions.filter((s) => s.applicationId === app.id && !["declined", "withdrawn"].includes(s.status)).map((s) => s.lenderId),
  );
  const matches = useMemo(
    () => matchLenders(matchInputFromApplication(app, customer), data.lenders, data.programs).filter((m) => m.lender.active && !openLenderIds.has(m.lender.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [app, customer, data.lenders, data.programs, data.submissions],
  );
  const today = toDateInput(new Date().toISOString());
  const followDefault = toDateInput(addDays(new Date(), data.settings.financingDefaults.followUpDays));
  const docs = documentsFor(data, app.id);

  const draftFor = (lenderId: string): Draft => {
    const lender = data.lenders.find((l) => l.id === lenderId)!;
    return (
      drafts[lenderId] ?? {
        method: lender.integration === "api_connected" ? "api_demo" : "email",
        referenceNumber: "",
        contactPerson: (lender.contacts.find((c) => c.primary) ?? lender.contacts[0])?.name ?? "",
        submittedAt: today,
        followUpDate: followDefault,
        notes: "",
      }
    );
  };
  const patch = (lenderId: string, p: Partial<Draft>) => setDrafts((d) => ({ ...d, [lenderId]: { ...draftFor(lenderId), ...p } }));

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const chosen = matches.filter((m) => selected.has(m.lender.id));
  const allManual = chosen.every((m) => m.lender.integration !== "api_connected");

  const simulateApi = async (lenderId: string) => {
    const lender = data.lenders.find((l) => l.id === lenderId)!;
    setBusy(lenderId);
    const adapter = adapterFor(lender);
    const pkg = adapter.buildPackage({ application: app, customer, lender, documents: docs });
    const receipt = await adapter.submit(pkg);
    patch(lenderId, { referenceNumber: receipt.referenceNumber ?? "", method: receipt.method });
    setBusy(null);
    toast.info(receipt.message);
  };

  const submit = () => {
    const entries: SubmissionEntry[] = chosen.map((m) => {
      const d = draftFor(m.lender.id);
      return {
        lenderId: m.lender.id,
        programId: m.program?.id,
        method: d.method,
        referenceNumber: d.referenceNumber,
        contactPerson: d.contactPerson,
        submittedAt: fromDateInput(d.submittedAt),
        followUpDate: d.followUpDate ? fromDateInput(d.followUpDate) : undefined,
        notes: d.notes,
      };
    });
    const res = actions.submitToLenders(app.id, entries);
    if (res.ok) {
      toast.success(`${entries.length} submission${entries.length > 1 ? "s" : ""} recorded (simulated)`, { description: "Nothing was sent to any lender." });
      setSelected(new Set());
      setDrafts({});
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] gap-4 overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Submit to lenders</DialogTitle>
          <DialogDescription>
            Choose lenders for {app.id}. Each lender tracks its own status independently of the application.
          </DialogDescription>
        </DialogHeader>
        <Callout tone="warning" title="Simulation — no real submission">
          This prototype never contacts a lender or bank. Send the package yourself (email, portal, phone) and record it here, or run the labelled API demo.
        </Callout>

        {matches.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">No more eligible lenders — all active lenders already have an open submission.</p>
        ) : (
          <>
            <LenderMatchList matches={matches} selected={selected} onToggle={toggle} hideIneligible={!showAll} />
            <button type="button" onClick={() => setShowAll((s) => !s)} className="-mt-2 self-start text-xs font-medium text-primary hover:underline">
              {showAll ? "Hide lenders marked Not Eligible" : "Show lenders marked Not Eligible"}
            </button>
          </>
        )}

        {chosen.map((m) => {
          const d = draftFor(m.lender.id);
          const pkg = adapterFor(m.lender).buildPackage({ application: app, customer, lender: m.lender, documents: docs });
          const unmet = pkg.requirements.filter((r) => !r.met);
          return (
            <fieldset key={m.lender.id} className="space-y-3 rounded-lg border p-3">
              <legend className="sr-only">Submission details for {m.lender.name}</legend>
              <div className="flex items-center gap-2">
                <LenderAvatar lender={m.lender} size="sm" />
                <span className="text-sm font-medium">{m.lender.name}</span>
                <IntegrationBadge method={m.lender.integration} />
                <SimulatedTag className="ml-auto" />
              </div>
              <p className="text-xs text-muted-foreground">{m.lender.submissionInstructions}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Method</Label>
                  <Select value={d.method} onValueChange={(v) => patch(m.lender.id, { method: v as SubmissionMethod })}>
                    <SelectTrigger className="w-full" aria-label={`Method for ${m.lender.name}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(SUBMISSION_METHOD_LABEL) as SubmissionMethod[])
                        .filter((k) => k !== "api_demo" || m.lender.integration !== "manual")
                        .map((k) => (
                          <SelectItem key={k} value={k}>
                            {SUBMISSION_METHOD_LABEL[k]}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Lender contact</Label>
                  <Select value={d.contactPerson || "none"} onValueChange={(v) => patch(m.lender.id, { contactPerson: v === "none" ? "" : v })}>
                    <SelectTrigger className="w-full" aria-label={`Contact for ${m.lender.name}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not specified</SelectItem>
                      {m.lender.contacts.map((c) => (
                        <SelectItem key={c.id} value={c.name}>
                          {c.name} — {c.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs" htmlFor={`ref-${m.lender.id}`}>
                    Reference number {m.lender.integration === "manual" && <span className="text-muted-foreground">(optional)</span>}
                  </Label>
                  <div className="flex gap-2">
                    <Input id={`ref-${m.lender.id}`} value={d.referenceNumber} onChange={(e) => patch(m.lender.id, { referenceNumber: e.target.value })} placeholder="Lender's reference, if provided" />
                    {m.lender.integration !== "manual" && (
                      <Button type="button" variant="outline" onClick={() => simulateApi(m.lender.id)} disabled={busy === m.lender.id}>
                        {busy === m.lender.id ? <Loader2 className="animate-spin" /> : <Send />} Simulate
                      </Button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs" htmlFor={`sub-${m.lender.id}`}>Submitted on</Label>
                    <Input id={`sub-${m.lender.id}`} type="date" value={d.submittedAt} max={today} onChange={(e) => patch(m.lender.id, { submittedAt: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs" htmlFor={`fu-${m.lender.id}`}>Follow up</Label>
                    <Input id={`fu-${m.lender.id}`} type="date" value={d.followUpDate} min={d.submittedAt} onChange={(e) => patch(m.lender.id, { followUpDate: e.target.value })} />
                  </div>
                </div>
              </div>
              <Textarea value={d.notes} onChange={(e) => patch(m.lender.id, { notes: e.target.value })} aria-label={`Notes for ${m.lender.name}`} placeholder="Notes (e.g. who it was sent to, special instructions)" rows={2} />
              <div className="rounded-md bg-muted/50 p-2.5">
                <p className="mb-1.5 text-xs font-medium">Lender document requirements</p>
                <ul className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                  {pkg.requirements.map((r) => (
                    <li key={r.label} className="flex items-center gap-1.5 text-xs">
                      {r.met ? <Check className="size-3 text-emerald-600" /> : <TriangleAlert className="size-3 text-amber-600" />}
                      <span className={r.met ? "" : "text-amber-800"}>{r.label}</span>
                      <span className="text-muted-foreground">· {r.detail}</span>
                    </li>
                  ))}
                </ul>
                {unmet.length > 0 && <p className="mt-1.5 text-xs text-amber-800">{unmet.length} item{unmet.length > 1 ? "s" : ""} not yet received — the lender may request them.</p>}
              </div>
              {m.lender.integration !== "manual" && (
                <details className="text-xs">
                  <summary className="cursor-pointer font-medium text-muted-foreground">Preview illustrative API payload</summary>
                  <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-slate-950 p-3 font-mono text-[11px] leading-relaxed text-slate-100">{JSON.stringify(pkg.payload, null, 2)}</pre>
                </details>
              )}
            </fieldset>
          );
        })}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={chosen.length === 0}>
            <Send />
            {chosen.length === 0 ? "Select lenders" : allManual ? `Record Manual Submission${chosen.length > 1 ? "s" : ""} (${chosen.length})` : `Record ${chosen.length} submission${chosen.length > 1 ? "s" : ""} (simulated)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
