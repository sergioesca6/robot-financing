"use client";

import { useState } from "react";
import { CheckCircle2, FileSignature, Landmark, MoreHorizontal, Pencil, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { OfferDialog } from "@/components/applications/offer-dialog";
import { OfferBadge, Pill } from "@/components/shared/badges";
import { Callout, ConfirmDialog, LenderAvatar } from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FINANCING_TYPE_LABEL } from "@/domain/labels";
import type { FinancingApplication, FinancingOffer } from "@/domain/types";
import { formatDate, formatMoney } from "@/lib/format";
import { isOfferExpired, offerDaysLeft } from "@/lib/selectors";
import { validateStatusChange } from "@/lib/workflow";
import { cn } from "@/lib/utils";
import { useStore } from "@/store/store";

/* ---------------------------- comparison ---------------------------- */

interface Row {
  label: string;
  value: (o: FinancingOffer, app: FinancingApplication | undefined) => string;
  /** Returns a numeric key; the lowest across offers gets a highlight. */
  lowest?: (o: FinancingOffer) => number | undefined;
  highlight?: string;
}

const ROWS: Row[] = [
  { label: "Product", value: (o) => FINANCING_TYPE_LABEL[o.product] },
  { label: "Approved amount", value: (o, a) => formatMoney(o.approvedAmount, a?.currency ?? "USD") },
  { label: "Monthly payment", value: (o, a) => formatMoney(o.monthlyPayment, a?.currency ?? "USD", { decimals: true }), lowest: (o) => o.monthlyPayment, highlight: "Lowest payment" },
  { label: "Term", value: (o) => `${o.termMonths} months` },
  { label: "Rate", value: (o) => (o.product === "loan" ? `${(o.apr ?? 0).toFixed(2)}% APR` : `MF ${(o.moneyFactor ?? 0).toFixed(5)} (≈ ${((o.moneyFactor ?? 0) * 2400).toFixed(2)}%)`), lowest: (o) => (o.product === "loan" ? o.apr : undefined), highlight: "Lowest APR" },
  { label: "Down payment", value: (o, a) => formatMoney(o.downPayment, a?.currency ?? "USD") },
  { label: "Fees at signing", value: (o, a) => formatMoney(o.fees, a?.currency ?? "USD"), lowest: (o) => o.fees, highlight: "Lowest fees" },
  { label: "Due at signing", value: (o, a) => formatMoney(o.downPayment + o.fees, a?.currency ?? "USD"), lowest: (o) => o.downPayment + o.fees, highlight: "Lowest upfront" },
  { label: "Residual (lease)", value: (o, a) => (o.product === "lease" ? formatMoney(o.residualValue ?? 0, a?.currency ?? "USD") : "—") },
  { label: "Total cost*", value: (o, a) => formatMoney(o.totalCost, a?.currency ?? "USD"), lowest: (o) => o.totalCost, highlight: "Lowest total cost" },
  { label: "Expires", value: (o) => formatDate(o.expiresAt) },
  { label: "Conditions", value: (o) => (o.conditions.length ? o.conditions.join("; ") : "None") },
];

/** Side-by-side comparison of up to 3 offers. Highlights facts; never declares a "best" offer. */
export function OfferCompare({ offers, app, onClose }: { offers: FinancingOffer[]; app?: FinancingApplication; onClose?: () => void }) {
  const { data } = useStore();
  const mixed = new Set(offers.map((o) => o.product)).size > 1;
  const apps = new Map(data.applications.map((a) => [a.id, a]));
  const sameApp = new Set(offers.map((o) => o.applicationId)).size === 1;
  return (
    <div className="space-y-3">
      {mixed && <Callout tone="warning">Loan and lease offers use different structures. Lease totals exclude any end-of-term buyout; compare payment, upfront cost and ownership goals carefully.</Callout>}
      {!sameApp && <Callout tone="warning">These offers belong to different applications, so amounts and terms may not be directly comparable.</Callout>}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[520px] border-collapse text-sm">
          <thead>
            <tr className="bg-muted/50">
              <th className="w-36 px-3 py-2 text-left text-xs font-medium text-muted-foreground" scope="col">
                &nbsp;
              </th>
              {offers.map((o) => {
                const l = data.lenders.find((x) => x.id === o.lenderId);
                return (
                  <th key={o.id} scope="col" className="px-3 py-2 text-left align-top">
                    <div className="flex items-center gap-2">
                      {l && <LenderAvatar lender={l} size="sm" />}
                      <div>
                        <p className="text-sm font-semibold">{l?.name}</p>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          <OfferBadge status={o.status} />
                          {!sameApp && <span className="text-[11px] font-normal text-muted-foreground">{o.applicationId}</span>}
                        </div>
                      </div>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => {
              const keys = r.lowest ? offers.map(r.lowest) : [];
              const defined = keys.filter((k): k is number => k !== undefined);
              const min = defined.length > 1 ? Math.min(...defined) : undefined;
              const hasTie = min !== undefined && defined.filter((k) => k === min).length > 1;
              return (
                <tr key={r.label} className="border-t">
                  <th scope="row" className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                    {r.label}
                  </th>
                  {offers.map((o, i) => {
                    const isLow = min !== undefined && keys[i] === min && !hasTie && !(mixed && r.label === "Total cost*");
                    return (
                      <td key={o.id} className={cn("tnum px-3 py-2 align-top", isLow && "bg-emerald-50/70")}>
                        <span className={cn(isLow && "font-semibold text-emerald-800")}>{r.value(o, app ?? apps.get(o.applicationId))}</span>
                        {isLow && <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-wide text-emerald-700">{r.highlight}</span>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        * Total cost = down payment + fees at signing + all scheduled payments. Excludes taxes unless stated by the lender, insurance, and any lease buyout. Highlights show which figure is lowest; they are not a recommendation — the right choice depends on the customer&apos;s goals.
      </p>
      {onClose && (
        <Button variant="outline" size="sm" onClick={onClose}>
          Close comparison
        </Button>
      )}
    </div>
  );
}

/* ----------------------------- funding ----------------------------- */

export function FundDialog({ app, open, onOpenChange }: { app: FinancingApplication; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data, actions } = useStore();
  const accepted = app.acceptedOfferId ? data.offers.find((o) => o.id === app.acceptedOfferId) : undefined;
  const [amount, setAmount] = useState(String(accepted?.approvedAmount ?? app.requestedAmount));
  const lender = accepted ? data.lenders.find((l) => l.id === accepted.lenderId) : undefined;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mark {app.id} as funded</DialogTitle>
          <DialogDescription>
            Records funding from {lender?.name ?? "the lender"}, moves pending commissions to payable, and updates dashboard totals.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="fund-amount" className="text-xs">
            Funded amount ({app.currency})
          </Label>
          <Input id="fund-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <p className="text-xs text-muted-foreground">Defaults to the approved amount on the accepted offer. Adjust if the lender funded a different figure.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              const n = Number(amount);
              if (!(n > 0)) return void toast.error("Enter a funded amount above 0.");
              const res = actions.fundDeal(app.id, { fundedAmount: n });
              if (res.ok) {
                toast.success(`${app.id} marked funded`);
                onOpenChange(false);
              }
            }}
          >
            <Landmark /> Confirm funding
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------- per-offer actions ------------------------ */

type Pending = null | "accept" | "reject" | "delete" | "edit" | "fund";

export function OfferActionsMenu({ offer, trigger }: { offer: FinancingOffer; trigger?: React.ReactNode }) {
  const { data, actions, can } = useStore();
  const [pending, setPending] = useState<Pending>(null);
  const app = data.applications.find((a) => a.id === offer.applicationId);
  if (!app) return null;
  const lender = data.lenders.find((l) => l.id === offer.lenderId);
  const manage = can("offer.manage");
  const locked = ["funded", "closed"].includes(app.status);
  const expired = isOfferExpired(offer);
  const isAcceptedHere = offer.status === "accepted";
  const contractingErr = validateStatusChange(data, app, "contracting");
  const canAccept = manage && !locked && !expired && offer.status === "active" && !app.acceptedOfferId;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {trigger ?? (
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${lender?.name} offer`}>
              <MoreHorizontal />
            </Button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuItem disabled={!canAccept} onSelect={() => setPending("accept")}>
            <CheckCircle2 /> Accept offer
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!manage || locked || !["active", "draft"].includes(offer.status)} onSelect={() => setPending("reject")}>
            <XCircle /> Reject offer
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!isAcceptedHere || !can("application.status") || app.status !== "offer_accepted" || !!contractingErr}
            onSelect={() => {
              const r = actions.changeStatus(app.id, "contracting");
              if (r.ok) toast.success("Moved to Contracting");
            }}
          >
            <FileSignature /> Move to contracting
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!isAcceptedHere || !can("application.fund") || app.status !== "contracting"} onSelect={() => setPending("fund")}>
            <Landmark /> Mark funded…
          </DropdownMenuItem>
          {isAcceptedHere && app.status === "offer_accepted" && contractingErr && <p className="px-2 pb-1.5 text-[11px] leading-snug text-muted-foreground">{contractingErr}</p>}
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={!manage || locked || isAcceptedHere} onSelect={() => setPending("edit")}>
            <Pencil /> Edit
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!manage || locked || isAcceptedHere} onSelect={() => setPending("delete")} className="text-red-600 focus:text-red-600">
            <Trash2 /> Delete
          </DropdownMenuItem>
          {!canAccept && offer.status === "active" && !isAcceptedHere && (
            <p className="px-2 pt-1 text-[11px] leading-snug text-muted-foreground">{expired ? "This offer has expired." : app.acceptedOfferId ? "Another offer is already accepted." : !manage ? "Not available for your demo role." : ""}</p>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={pending === "accept"}
        onOpenChange={(o) => !o && setPending(null)}
        title={`Accept ${lender?.name}'s offer?`}
        description="Records the customer's acceptance, locks lender statuses, closes competing offers, and creates estimated commissions. Nothing is sent to the lender."
        confirmLabel="Accept offer"
        onConfirm={() => {
          const r = actions.acceptOffer(offer.id);
          if (r.ok) toast.success("Offer accepted", { description: "Application moved to Offer Accepted." });
        }}
      >
        <dl className="grid grid-cols-3 gap-2 rounded-lg bg-muted/50 p-3 text-center text-xs">
          <div>
            <dt className="text-muted-foreground">Payment</dt>
            <dd className="tnum font-semibold">{formatMoney(offer.monthlyPayment, app.currency, { decimals: true })}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Term</dt>
            <dd className="font-semibold">{offer.termMonths} mo</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Total cost</dt>
            <dd className="tnum font-semibold">{formatMoney(offer.totalCost, app.currency)}</dd>
          </div>
        </dl>
      </ConfirmDialog>
      <ConfirmDialog
        open={pending === "reject"}
        onOpenChange={(o) => !o && setPending(null)}
        title="Reject this offer?"
        description="The offer is kept for the record but can't be accepted."
        confirmLabel="Reject offer"
        destructive
        onConfirm={() => {
          const r = actions.rejectOffer(offer.id);
          if (r.ok) toast.success("Offer rejected");
        }}
      />
      <ConfirmDialog
        open={pending === "delete"}
        onOpenChange={(o) => !o && setPending(null)}
        title="Delete this offer?"
        description="This removes it permanently from the demo data."
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          const r = actions.deleteOffer(offer.id);
          if (r.ok) toast.success("Offer deleted");
        }}
      />
      {pending === "edit" && <OfferDialog open onOpenChange={(o) => !o && setPending(null)} applicationId={offer.applicationId} offer={offer} />}
      {pending === "fund" && <FundDialog app={app} open onOpenChange={(o) => !o && setPending(null)} />}
    </>
  );
}

export function ExpiryPill({ offer }: { offer: FinancingOffer }) {
  if (offer.status !== "active") return null;
  const days = offerDaysLeft(offer);
  if (days < 0) return <Pill tone="danger">Expired</Pill>;
  if (days <= 7) return <Pill tone="warning">Expires in {days}d</Pill>;
  return null;
}
