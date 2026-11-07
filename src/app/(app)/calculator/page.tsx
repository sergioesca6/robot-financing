"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ClipboardCopy, RotateCcw } from "lucide-react";
import { OfferDialog } from "@/components/applications/offer-dialog";
import { Callout, DataRow, Field, PageHeader, SectionCard } from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Currency } from "@/domain/types";
import { CHART } from "@/lib/chart-colors";
import { calculateLease, calculateLoan, validateLeaseInput, validateLoanInput } from "@/lib/finance";
import { formatMoney } from "@/lib/format";
import { customerDisplayName } from "@/lib/selectors";
import { useStore } from "@/store/store";

const axis = { tick: { fontSize: 11, fill: CHART.axis }, tickLine: false, axisLine: false } as const;
const tip = { contentStyle: { borderRadius: 8, border: "1px solid #e6e9f0", fontSize: 12 } };
const num = (s: string): number => (s.trim() === "" ? NaN : Number(s));
const nz = (s: string): number => (Number.isNaN(num(s)) ? 0 : num(s));

interface LoanForm { price: string; down: string; fees: string; apr: string; term: string; financeFees: boolean; tax: string }
interface LeaseForm { price: string; upfront: string; fees: string; term: string; residualPct: string; residualAmt: string; mf: string; capFees: boolean; tax: string }

export default function CalculatorPage() {
  const { data } = useStore();
  const fd = data.settings.financingDefaults;
  const loanDefaults: LoanForm = { price: "250000", down: "25000", fees: String(fd.docFee), apr: String(fd.loanApr), term: String(fd.loanTermMonths), financeFees: false, tax: "0" };
  const leaseDefaults: LeaseForm = { price: "250000", upfront: "10000", fees: String(fd.docFee), term: String(fd.leaseTermMonths), residualPct: String(fd.leaseResidualPercent), residualAmt: "", mf: String(fd.leaseMoneyFactor), capFees: false, tax: "0" };

  const [tab, setTab] = useState("loan");
  const [currency, setCurrency] = useState<Currency>("USD");
  const [loan, setLoan] = useState<LoanForm>(loanDefaults);
  const [lease, setLease] = useState<LeaseForm>(leaseDefaults);
  const [appId, setAppId] = useState("");
  const [offerOpen, setOfferOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const loanInput = { price: nz(loan.price), downPayment: nz(loan.down), fees: nz(loan.fees), aprPercent: nz(loan.apr), termMonths: nz(loan.term), financeFees: loan.financeFees, taxRatePercent: nz(loan.tax) };
  const leaseInput = {
    price: nz(lease.price), upfront: nz(lease.upfront), fees: nz(lease.fees), termMonths: nz(lease.term),
    residualValue: lease.residualAmt.trim() ? nz(lease.residualAmt) : undefined, residualPercent: nz(lease.residualPct),
    moneyFactor: nz(lease.mf), capitalizeFees: lease.capFees, taxRatePercent: nz(lease.tax),
  };
  const loanErr = validateLoanInput(loanInput);
  const leaseErr = validateLeaseInput(leaseInput);
  const loanOk = Object.keys(loanErr).length === 0;
  const leaseOk = Object.keys(leaseErr).length === 0;
  const loanRes = loanOk ? calculateLoan(loanInput) : null;
  const leaseRes = leaseOk ? calculateLease(leaseInput) : null;

  const fmt = (n: number, d = false) => formatMoney(n, currency, { decimals: d });

  const prefill = (id: string) => {
    setAppId(id);
    const a = data.applications.find((x) => x.id === id);
    if (!a) return;
    setCurrency(a.currency);
    const credits = String(a.downPayment + a.tradeInCredit);
    setLoan({ ...loanDefaults, price: String(a.purchaseTotal), down: credits, term: String(a.preferredTermMonths) });
    setLease({ ...leaseDefaults, price: String(a.purchaseTotal), upfront: credits, term: String(a.preferredTermMonths) });
    setTab(a.financingType);
  };
  const reset = () => {
    setLoan(loanDefaults);
    setLease(leaseDefaults);
    setAppId("");
    setCurrency("USD");
  };

  const seed = tab === "loan" && loanRes
    ? { product: "loan" as const, approvedAmount: loanRes.amountFinanced, downPayment: nz(loan.down), apr: nz(loan.apr), termMonths: nz(loan.term), fees: loan.financeFees ? 0 : nz(loan.fees), notes: `Prefilled from Payment Calculator.${nz(loan.tax) ? ` Includes ${loan.tax}% tax assumption in the financed amount.` : ""} Replace with the lender's quoted terms.` }
    : leaseRes
      ? { product: "lease" as const, approvedAmount: leaseRes.capitalizedCost, downPayment: nz(lease.upfront), moneyFactor: nz(lease.mf), residualValue: leaseRes.residual, termMonths: nz(lease.term), fees: lease.capFees ? 0 : nz(lease.fees), notes: "Prefilled from Payment Calculator. Replace with the lender's quoted terms." }
      : undefined;

  const yearly = useMemo(() => {
    if (!loanRes) return [];
    let cum = 0;
    return loanRes.schedule.map((r) => ({ month: r.n, balance: r.balance, interest: (cum += r.interest) }));
  }, [loanRes]);

  return (
    <>
      <PageHeader
        title="Payment calculator"
        description="Estimate loan or lease payments. Loan and lease maths are kept separate, and taxes and fees are only included when you enter them."
        actions={
          <>
            <Button variant="outline" onClick={reset}>
              <RotateCcw /> Reset
            </Button>
            <Button disabled={!seed} onClick={() => setOfferOpen(true)}>
              <ClipboardCopy /> Copy to draft offer
            </Button>
          </>
        }
      />
      <Callout tone="warning" className="mb-4" title="Illustrative estimates">
        Results use the inputs below only. Actual lender quotes depend on credit approval, program terms, taxes, fees and local rules.
      </Callout>

      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3">
        <span className="text-sm font-medium">Prefill from application</span>
        <Select value={appId || "none"} onValueChange={(v) => (v === "none" ? setAppId("") : prefill(v))}>
          <SelectTrigger className="w-72" aria-label="Prefill from application">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Manual entry</SelectItem>
            {data.applications.filter((a) => !a.archived).map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.id} · {customerDisplayName(data.customers.find((c) => c.id === a.customerId))}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="ml-auto flex items-center gap-2 text-sm">
          Currency
          <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
            <SelectTrigger className="w-24" aria-label="Currency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="USD">USD</SelectItem>
              <SelectItem value="CAD">CAD</SelectItem>
            </SelectContent>
          </Select>
        </span>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="loan">Loan</TabsTrigger>
          <TabsTrigger value="lease">Lease</TabsTrigger>
        </TabsList>

        <TabsContent value="loan" className="grid gap-4 lg:grid-cols-[380px_1fr]">
          <SectionCard title="Loan inputs">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <In label="Purchase price" v={loan.price} on={(v) => setLoan({ ...loan, price: v })} err={loanErr.price} />
              <In label="Down payment" v={loan.down} on={(v) => setLoan({ ...loan, down: v })} err={loanErr.downPayment} />
              <In label="Interest rate (APR %)" v={loan.apr} on={(v) => setLoan({ ...loan, apr: v })} err={loanErr.aprPercent} />
              <In label="Term (months)" v={loan.term} on={(v) => setLoan({ ...loan, term: v })} err={loanErr.termMonths} />
              <In label="Fees (documentation, etc.)" v={loan.fees} on={(v) => setLoan({ ...loan, fees: v })} err={loanErr.fees} />
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={loan.financeFees} onCheckedChange={(v) => setLoan({ ...loan, financeFees: v === true })} /> Roll fees into the loan
              </label>
              <In label="Sales tax assumption (%)" v={loan.tax} on={(v) => setLoan({ ...loan, tax: v })} err={loanErr.taxRatePercent} hint="0 = tax excluded. Applied to the price and financed." />
            </div>
          </SectionCard>
          <div className="space-y-4">
            {loanRes ? (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Big label="Monthly payment" value={fmt(loanRes.monthlyPayment, true)} accent />
                  <Big label="Amount financed" value={fmt(loanRes.amountFinanced)} />
                  <Big label="Total interest" value={fmt(loanRes.totalInterest)} />
                </div>
                <SectionCard title="Summary">
                  <dl className="grid gap-x-8 sm:grid-cols-2">
                    <div>
                      <DataRow label="Tax (assumed)">{loanRes.taxAmount ? fmt(loanRes.taxAmount, true) : "Not included"}</DataRow>
                      <DataRow label="Due upfront">{fmt(loanRes.upfrontCost, true)}</DataRow>
                      <DataRow label="Total of payments">{fmt(loanRes.totalPayments, true)}</DataRow>
                    </div>
                    <div>
                      <DataRow label="Total cost of financing">
                        <strong>{fmt(loanRes.totalCost, true)}</strong>
                      </DataRow>
                      <DataRow label="Fees">{loan.financeFees ? "Financed" : "Paid upfront"}</DataRow>
                      <DataRow label="Last payment">{fmt(loanRes.schedule.at(-1)?.payment ?? 0, true)}</DataRow>
                    </div>
                  </dl>
                </SectionCard>
                <SectionCard title="Balance and cumulative interest">
                  <ResponsiveContainer width="100%" height={240}>
                    <AreaChart data={yearly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke={CHART.grid} vertical={false} />
                      <XAxis dataKey="month" {...axis} label={{ value: "Month", position: "insideBottom", offset: -2, fontSize: 11, fill: CHART.axis }} />
                      <YAxis {...axis} width={56} tickFormatter={(v: number) => formatMoney(v, currency, { compact: true })} />
                      <Tooltip {...tip} formatter={(v) => fmt(Number(v))} labelFormatter={(l) => `Month ${l}`} />
                      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                      <Area type="monotone" dataKey="balance" name="Remaining balance" stroke={CHART.navy} fill={CHART.navy} fillOpacity={0.1} strokeWidth={2} />
                      <Area type="monotone" dataKey="interest" name="Cumulative interest" stroke={CHART.amber} fill={CHART.amber} fillOpacity={0.12} strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </SectionCard>
                <SectionCard title="Amortization schedule" flush action={<Button variant="ghost" size="sm" onClick={() => setShowAll((s) => !s)}>{showAll ? "Show first 12" : `Show all ${loanRes.schedule.length}`}</Button>}>
                  <div className="max-h-96 overflow-auto">
                    <Table className="text-[13px]">
                      <TableHeader>
                        <TableRow className="bg-muted/40 hover:bg-muted/40">
                          <TableHead className="text-xs">#</TableHead>
                          <TableHead className="text-right text-xs">Payment</TableHead>
                          <TableHead className="text-right text-xs">Principal</TableHead>
                          <TableHead className="text-right text-xs">Interest</TableHead>
                          <TableHead className="text-right text-xs">Balance</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(showAll ? loanRes.schedule : loanRes.schedule.slice(0, 12)).map((r) => (
                          <TableRow key={r.n}>
                            <TableCell>{r.n}</TableCell>
                            <TableCell className="tnum text-right">{fmt(r.payment, true)}</TableCell>
                            <TableCell className="tnum text-right">{fmt(r.principal, true)}</TableCell>
                            <TableCell className="tnum text-right">{fmt(r.interest, true)}</TableCell>
                            <TableCell className="tnum text-right">{fmt(r.balance, true)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </SectionCard>
              </>
            ) : (
              <Callout tone="danger" title="Fix the highlighted inputs to see results">
                {Object.values(loanErr)[0]}
              </Callout>
            )}
          </div>
        </TabsContent>

        <TabsContent value="lease" className="grid gap-4 lg:grid-cols-[380px_1fr]">
          <SectionCard title="Lease inputs">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <In label="Robot price" v={lease.price} on={(v) => setLease({ ...lease, price: v })} err={leaseErr.price} />
              <In label="Upfront payment (cap. cost reduction)" v={lease.upfront} on={(v) => setLease({ ...lease, upfront: v })} err={leaseErr.upfront} />
              <In label="Term (months)" v={lease.term} on={(v) => setLease({ ...lease, term: v })} err={leaseErr.termMonths} />
              <In label="Money factor" v={lease.mf} on={(v) => setLease({ ...lease, mf: v })} err={leaseErr.moneyFactor} hint={`≈ ${(nz(lease.mf) * 2400).toFixed(2)}% APR equivalent (informational only)`} />
              <In label="Residual (% of price)" v={lease.residualPct} on={(v) => setLease({ ...lease, residualPct: v })} err={leaseErr.residual} />
              <In label="…or residual amount" v={lease.residualAmt} on={(v) => setLease({ ...lease, residualAmt: v })} hint="Overrides the percentage when entered." />
              <In label="Fees (documentation, etc.)" v={lease.fees} on={(v) => setLease({ ...lease, fees: v })} err={leaseErr.fees} />
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={lease.capFees} onCheckedChange={(v) => setLease({ ...lease, capFees: v === true })} /> Capitalize fees into the lease
              </label>
              <In label="Tax on payments (%)" v={lease.tax} on={(v) => setLease({ ...lease, tax: v })} err={leaseErr.taxRatePercent} hint="0 = tax excluded. Applied to each monthly payment." />
            </div>
          </SectionCard>
          <div className="space-y-4">
            {leaseRes ? (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Big label="Monthly payment" value={fmt(leaseRes.monthlyPayment, true)} accent />
                  <Big label="Capitalized cost" value={fmt(leaseRes.capitalizedCost)} />
                  <Big label="Residual value" value={fmt(leaseRes.residual)} />
                </div>
                <SectionCard title="Monthly payment breakdown">
                  <dl className="grid gap-x-8 sm:grid-cols-2">
                    <div>
                      <DataRow label="Depreciation">{fmt(leaseRes.depreciationPerMonth, true)}</DataRow>
                      <DataRow label="Rent charge">{fmt(leaseRes.rentChargePerMonth, true)}</DataRow>
                      <DataRow label="Tax (assumed)">{leaseRes.taxPerMonth ? fmt(leaseRes.taxPerMonth, true) : "Not included"}</DataRow>
                    </div>
                    <div>
                      <DataRow label="Due upfront">{fmt(leaseRes.upfrontCost, true)}</DataRow>
                      <DataRow label="Total lease payments">{fmt(leaseRes.totalLeasePayments, true)}</DataRow>
                      <DataRow label="Informational APR">{leaseRes.equivalentApr.toFixed(2)}%</DataRow>
                    </div>
                  </dl>
                </SectionCard>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Big label="Total cost if returned" value={fmt(leaseRes.totalCostIfReturned)} sub="upfront + all payments" />
                  <Big label="Total cost if purchased" value={fmt(leaseRes.totalCostIfPurchased)} sub="adds the residual buyout" />
                </div>
                <SectionCard title="Where the money goes">
                  <ResponsiveContainer width="100%" height={150}>
                    <BarChart
                      layout="vertical"
                      data={[{
                        name: "Total lease cost",
                        Upfront: leaseRes.upfrontCost,
                        Depreciation: leaseRes.depreciationPerMonth * nz(lease.term),
                        "Rent charge": leaseRes.rentChargePerMonth * nz(lease.term),
                        Tax: leaseRes.taxPerMonth * nz(lease.term),
                      }]}
                      margin={{ top: 8, right: 8, left: 8, bottom: 0 }}
                    >
                      <CartesianGrid stroke={CHART.grid} horizontal={false} />
                      <XAxis type="number" {...axis} tickFormatter={(v: number) => formatMoney(v, currency, { compact: true })} />
                      <YAxis type="category" dataKey="name" hide />
                      <Tooltip {...tip} formatter={(v) => fmt(Number(v))} />
                      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="Upfront" stackId="a" fill={CHART.slate} />
                      <Bar dataKey="Depreciation" stackId="a" fill={CHART.navy} />
                      <Bar dataKey="Rent charge" stackId="a" fill={CHART.amber} />
                      <Bar dataKey="Tax" stackId="a" fill={CHART.teal} />
                    </BarChart>
                  </ResponsiveContainer>
                </SectionCard>
                <Callout tone="info">Lease totals exclude the end-of-term buyout unless you choose “purchased”. Money factor is shown only for reference — it is not an APR.</Callout>
              </>
            ) : (
              <Callout tone="danger" title="Fix the highlighted inputs to see results">
                {Object.values(leaseErr)[0]}
              </Callout>
            )}
          </div>
        </TabsContent>
      </Tabs>
      {offerOpen && <OfferDialog open onOpenChange={setOfferOpen} applicationId={appId || undefined} seed={seed} />}
    </>
  );
}

function In({ label, v, on, err, hint }: { label: string; v: string; on: (v: string) => void; err?: string; hint?: string }) {
  return (
    <Field label={label} error={err} hint={hint}>
      {(id) => <Input id={id} inputMode="decimal" value={v} onChange={(e) => on(e.target.value)} aria-invalid={!!err} className="tnum" />}
    </Field>
  );
}

function Big({ label, value, accent, sub }: { label: string; value: string; accent?: boolean; sub?: string }) {
  return (
    <div className={`rounded-xl border p-4 ${accent ? "border-primary/30 bg-primary/5" : "bg-card"}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="tnum mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
