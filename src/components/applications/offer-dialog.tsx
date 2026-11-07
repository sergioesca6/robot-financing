"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Callout, Field } from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FINANCING_TYPE_LABEL, TERM_OPTIONS } from "@/domain/labels";
import type { FinancingOffer, FinancingType } from "@/domain/types";
import { computeOfferEconomics } from "@/lib/finance";
import { addDays, formatMoney, fromDateInput, toDateInput } from "@/lib/format";
import { customerDisplayName } from "@/lib/selectors";
import type { OfferInput } from "@/lib/workflow";
import { useStore } from "@/store/store";

type Seed = Partial<Pick<OfferInput, "lenderId" | "product" | "approvedAmount" | "downPayment" | "apr" | "moneyFactor" | "termMonths" | "fees" | "residualValue" | "notes">>;

export function OfferDialog({
  open,
  onOpenChange,
  applicationId,
  offer,
  seed,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** When omitted the user picks an application. */
  applicationId?: string;
  offer?: FinancingOffer;
  /** Pre-fill (e.g. from the calculator). */
  seed?: Seed;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <OfferForm applicationId={applicationId} offer={offer} seed={seed} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

const num = (v: string): number | undefined => (v.trim() === "" || Number.isNaN(Number(v)) ? undefined : Number(v));

function OfferForm({ applicationId, offer, seed, onDone }: { applicationId?: string; offer?: FinancingOffer; seed?: Seed; onDone: () => void }) {
  const { data, actions } = useStore();
  const [appId, setAppId] = useState(offer?.applicationId ?? applicationId ?? "");
  const app = data.applications.find((a) => a.id === appId);
  const lendersWithSub = useMemo(() => {
    const ids = new Set(data.submissions.filter((s) => s.applicationId === appId && s.status !== "withdrawn").map((s) => s.lenderId));
    return data.lenders.filter((l) => ids.has(l.id));
  }, [data.submissions, data.lenders, appId]);

  const fd = data.settings.financingDefaults;
  const [lenderId, setLenderId] = useState(offer?.lenderId ?? seed?.lenderId ?? "");
  const [product, setProduct] = useState<FinancingType>(offer?.product ?? seed?.product ?? app?.financingType ?? "loan");
  const [amount, setAmount] = useState(String(offer?.approvedAmount ?? seed?.approvedAmount ?? app?.requestedAmount ?? ""));
  const [down, setDown] = useState(String(offer?.downPayment ?? seed?.downPayment ?? app?.downPayment ?? 0));
  const [apr, setApr] = useState(String(offer?.apr ?? seed?.apr ?? ""));
  const [mf, setMf] = useState(String(offer?.moneyFactor ?? seed?.moneyFactor ?? ""));
  const [residual, setResidual] = useState(String(offer?.residualValue ?? seed?.residualValue ?? ""));
  const [term, setTerm] = useState(String(offer?.termMonths ?? seed?.termMonths ?? app?.preferredTermMonths ?? 60));
  const [fees, setFees] = useState(String(offer?.fees ?? seed?.fees ?? 0));
  const [expires, setExpires] = useState(toDateInput(offer?.expiresAt ?? addDays(new Date(), fd.offerValidityDays)));
  const [conditions, setConditions] = useState((offer?.conditions ?? []).join("\n"));
  const [notes, setNotes] = useState(offer?.notes ?? seed?.notes ?? "");
  const [status, setStatus] = useState<"draft" | "active">(offer?.status === "draft" || (!offer && !!seed) ? "draft" : "active");

  const currency = app?.currency ?? "USD";
  const econ = useMemo(() => {
    const a = num(amount);
    const t = num(term);
    if (!a || !t) return null;
    if (product === "loan" && num(apr) === undefined) return null;
    if (product === "lease" && (num(mf) === undefined || !num(residual))) return null;
    return computeOfferEconomics({ product, approvedAmount: a, downPayment: num(down) ?? 0, apr: num(apr), moneyFactor: num(mf), termMonths: t, fees: num(fees) ?? 0, residualValue: num(residual) });
  }, [amount, term, product, apr, mf, residual, down, fees]);

  const pickLender = (id: string) => {
    setLenderId(id);
    const sub = data.submissions.find((s) => s.applicationId === appId && s.lenderId === id && s.status !== "withdrawn");
    const t = sub?.offeredTerms;
    if (t && !offer) {
      if (t.amount) setAmount(String(t.amount));
      if (t.apr !== undefined && product === "loan") setApr(String(t.apr));
      if (t.termMonths) setTerm(String(t.termMonths));
    }
  };

  const save = () => {
    if (!app) return void toast.error("Choose an application.");
    if (!lenderId) return void toast.error("Choose a lender.");
    const res = actions.saveOffer({
      id: offer?.id,
      applicationId: app.id,
      lenderId,
      product,
      approvedAmount: num(amount) ?? 0,
      downPayment: num(down) ?? 0,
      apr: product === "loan" ? num(apr) : undefined,
      moneyFactor: product === "lease" ? num(mf) : undefined,
      residualValue: product === "lease" ? num(residual) : undefined,
      termMonths: num(term) ?? 0,
      fees: num(fees) ?? 0,
      expiresAt: fromDateInput(expires),
      conditions: conditions.split("\n").map((c) => c.trim()).filter(Boolean),
      status,
      notes,
    });
    if (res.ok) {
      toast.success(offer ? "Offer updated" : "Offer added");
      onDone();
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{offer ? "Edit offer" : "Add financing offer"}</DialogTitle>
        <DialogDescription>Enter the terms exactly as the lender quoted them. Payment and total cost are calculated from these inputs.</DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 sm:grid-cols-2">
        {!applicationId && !offer && (
          <Field label="Application" required className="sm:col-span-2">
            {(id) => (
              <Select
                value={appId}
                onValueChange={(v) => {
                  setAppId(v);
                  setLenderId("");
                  const a = data.applications.find((x) => x.id === v);
                  if (a) {
                    setProduct(a.financingType);
                    setAmount(String(a.requestedAmount));
                    setDown(String(a.downPayment));
                    setTerm(String(a.preferredTermMonths));
                  }
                }}
              >
                <SelectTrigger id={id} className="w-full">
                  <SelectValue placeholder="Select an application with a lender submission" />
                </SelectTrigger>
                <SelectContent>
                  {data.applications
                    .filter((a) => !a.archived && data.submissions.some((s) => s.applicationId === a.id && s.status !== "withdrawn") && !["funded", "closed"].includes(a.status))
                    .map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.id} · {customerDisplayName(data.customers.find((c) => c.id === a.customerId))}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            )}
          </Field>
        )}

        {appId && lendersWithSub.length === 0 && (
          <Callout tone="warning" className="sm:col-span-2" title="No lender submission yet">
            Record a submission to a lender first — offers are tied to a lender&apos;s response.
          </Callout>
        )}

        <Field label="Lender" required>
          {(id) => (
            <Select value={lenderId} onValueChange={pickLender} disabled={!!offer}>
              <SelectTrigger id={id} className="w-full">
                <SelectValue placeholder="Select lender" />
              </SelectTrigger>
              <SelectContent>
                {lendersWithSub.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
        <Field label="Product" required>
          {(id) => (
            <Select value={product} onValueChange={(v) => setProduct(v as FinancingType)} disabled={!!offer}>
              <SelectTrigger id={id} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["loan", "lease"] as const).map((p) => (
                  <SelectItem key={p} value={p}>
                    {FINANCING_TYPE_LABEL[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>

        <Field label={product === "loan" ? "Approved amount (financed)" : "Capitalized cost (net of down payment)"} required>
          {(id) => <Input id={id} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />}
        </Field>
        <Field label="Down payment" hint="Cash from the customer at signing.">
          {(id) => <Input id={id} inputMode="decimal" value={down} onChange={(e) => setDown(e.target.value)} />}
        </Field>

        {product === "loan" ? (
          <Field label="APR (%)" required>
            {(id) => <Input id={id} inputMode="decimal" value={apr} onChange={(e) => setApr(e.target.value)} placeholder="e.g. 7.9" />}
          </Field>
        ) : (
          <>
            <Field label="Money factor" required hint="e.g. 0.00250 (informational APR ≈ MF × 2400).">
              {(id) => <Input id={id} inputMode="decimal" value={mf} onChange={(e) => setMf(e.target.value)} placeholder="0.00250" />}
            </Field>
            <Field label="Residual value" required hint="End-of-term value; must be below the capitalized cost.">
              {(id) => <Input id={id} inputMode="decimal" value={residual} onChange={(e) => setResidual(e.target.value)} />}
            </Field>
          </>
        )}
        <Field label="Term (months)" required>
          {(id) => (
            <Select value={term} onValueChange={setTerm}>
              <SelectTrigger id={id} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[...new Set([...TERM_OPTIONS, Number(term)])].sort((a, b) => a - b).map((t) => (
                  <SelectItem key={t} value={String(t)}>
                    {t} months
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
        <Field label="Fees paid at signing" hint="Documentation and other fees. Not financed.">
          {(id) => <Input id={id} inputMode="decimal" value={fees} onChange={(e) => setFees(e.target.value)} />}
        </Field>
        <Field label="Offer expires" required>
          {(id) => <Input id={id} type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />}
        </Field>
        <Field label="Status">
          {(id) => (
            <Select value={status} onValueChange={(v) => setStatus(v as "draft" | "active")}>
              <SelectTrigger id={id} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active — presentable to customer</SelectItem>
                <SelectItem value="draft">Draft — not yet confirmed by lender</SelectItem>
              </SelectContent>
            </Select>
          )}
        </Field>
        <Field label="Conditions (one per line)" className="sm:col-span-2">
          {(id) => <Textarea id={id} rows={2} value={conditions} onChange={(e) => setConditions(e.target.value)} placeholder="e.g. Proof of insurance before funding" />}
        </Field>
        <Field label="Internal notes" className="sm:col-span-2">
          {(id) => <Textarea id={id} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />}
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/50 p-3 text-center">
        <Stat label="Monthly payment" value={econ ? formatMoney(econ.monthlyPayment, currency, { decimals: true }) : "—"} />
        <Stat label="Due at signing" value={econ ? formatMoney(econ.upfrontCost, currency) : "—"} />
        <Stat label={product === "lease" ? "Total cost (excl. buyout)" : "Total cost"} value={econ ? formatMoney(econ.totalCost, currency) : "—"} />
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button onClick={save}>{offer ? "Save changes" : "Add offer"}</Button>
      </DialogFooter>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="tnum text-sm font-semibold">{value}</p>
    </div>
  );
}
