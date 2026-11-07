"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Callout, Field } from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CREDIT_LABEL, CUSTOMER_TYPE_LABEL, DOCUMENT_TYPE_LABEL, FINANCING_TYPE_LABEL, INTEGRATION_LABEL, ROBOT_CATEGORY_LABEL, TERM_OPTIONS } from "@/domain/labels";
import type { Country, CreditProfile, Currency, CustomerType, DocumentType, FinancingType, IntegrationMethod, Lender, LenderContact, LenderProgram, RobotCategory } from "@/domain/types";
import { uid } from "@/lib/id";
import { useStore } from "@/store/store";

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

export function CheckGroup<T extends string | number>({ label, options, value, onChange, error }: { label: string; options: { value: T; label: string }[]; value: T[]; onChange: (v: T[]) => void; error?: string }) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-xs font-medium text-foreground/80">{label}</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 rounded-lg border bg-card p-2.5">
        {options.map((o) => (
          <label key={String(o.value)} className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox checked={value.includes(o.value)} onCheckedChange={() => onChange(toggle(value, o.value))} />
            {o.label}
          </label>
        ))}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </fieldset>
  );
}

const n = (v: string): number => (v.trim() === "" || Number.isNaN(Number(v)) ? NaN : Number(v));

/* ------------------------------- lender ------------------------------ */

export function LenderDialog({ open, onOpenChange, lender, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; lender?: Lender; onSaved?: (l: Lender) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <LenderForm lender={lender} onDone={(l) => { if (l) onSaved?.(l); onOpenChange(false); }} />
      </DialogContent>
    </Dialog>
  );
}

function LenderForm({ lender, onDone }: { lender?: Lender; onDone: (l?: Lender) => void }) {
  const { actions } = useStore();
  const [name, setName] = useState(lender?.name ?? "");
  const [countries, setCountries] = useState<Country[]>(lender?.countries ?? ["US"]);
  const [currencies, setCurrencies] = useState<Currency[]>(lender?.currencies ?? ["USD"]);
  const [custTypes, setCustTypes] = useState<CustomerType[]>(lender?.customerTypes ?? ["business"]);
  const [products, setProducts] = useState<FinancingType[]>(lender?.products ?? ["loan"]);
  const [cats, setCats] = useState<RobotCategory[]>(lender?.robotCategories ?? ["industrial", "collaborative"]);
  const [minAmount, setMinAmount] = useState(String(lender?.minAmount ?? 25000));
  const [maxAmount, setMaxAmount] = useState(String(lender?.maxAmount ?? 500000));
  const [terms, setTerms] = useState<number[]>(lender?.terms ?? [36, 48, 60]);
  const [aprMin, setAprMin] = useState(String(lender?.aprMin ?? 6));
  const [aprMax, setAprMax] = useState(String(lender?.aprMax ?? 12));
  const [minCredit, setMinCredit] = useState<CreditProfile>(lender?.minCredit ?? "fair");
  const [minYears, setMinYears] = useState(String(lender?.minYearsInBusiness ?? 2));
  const [minRevenue, setMinRevenue] = useState(String(lender?.minAnnualRevenue ?? 0));
  const [creditReq, setCreditReq] = useState(lender?.creditRequirements ?? "");
  const [turnaround, setTurnaround] = useState(String(lender?.turnaroundDays ?? 3));
  const [integration, setIntegration] = useState<IntegrationMethod>(lender?.integration ?? "manual");
  const [instructions, setInstructions] = useState(lender?.submissionInstructions ?? "");
  const [dealerFee, setDealerFee] = useState(String(lender?.commission.dealerFeePercent ?? 1));
  const [flatFee, setFlatFee] = useState(String(lender?.commission.financingFeeFlat ?? 0));
  const [commNotes, setCommNotes] = useState(lender?.commission.notes ?? "");
  const [docs, setDocs] = useState<DocumentType[]>(lender?.requiredDocuments ?? ["identification", "equipment_quotation"]);
  const [notes, setNotes] = useState(lender?.notes ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = () => {
    const e: Record<string, string> = {};
    if (name.trim().length < 2) e.name = "Enter the lender name";
    if (!countries.length) e.countries = "Select at least one country";
    if (!currencies.length) e.currencies = "Select at least one currency";
    if (!custTypes.length) e.custTypes = "Select at least one customer type";
    if (!products.length) e.products = "Select at least one product";
    if (!(n(minAmount) >= 0) || !(n(maxAmount) > 0)) e.amount = "Enter valid minimum and maximum amounts";
    else if (n(minAmount) > n(maxAmount)) e.amount = "Minimum can't exceed maximum";
    if (!(n(aprMin) >= 0) || !(n(aprMax) >= 0)) e.apr = "Enter valid rates";
    else if (n(aprMin) > n(aprMax)) e.apr = "Minimum rate can't exceed maximum";
    if (!terms.length) e.terms = "Select at least one term";
    if (!(n(turnaround) >= 0)) e.turnaround = "Enter turnaround days";
    if (!(n(dealerFee) >= 0) || n(dealerFee) > 10) e.dealerFee = "Dealer fee must be 0–10%";
    if (!(n(flatFee) >= 0)) e.flatFee = "Enter 0 or more";
    setErrors(e);
    if (Object.keys(e).length) return;
    const initials = lender?.initials ?? name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
    const next: Lender = {
      id: lender?.id ?? uid("lnd"),
      name: name.trim(),
      initials,
      hue: lender?.hue ?? Math.floor(Math.random() * 360),
      active: lender?.active ?? true,
      countries,
      currencies,
      customerTypes: custTypes,
      products,
      robotCategories: cats,
      minAmount: n(minAmount),
      maxAmount: n(maxAmount),
      terms: [...terms].sort((a, b) => a - b),
      aprMin: n(aprMin),
      aprMax: n(aprMax),
      minCredit,
      minYearsInBusiness: n(minYears) || 0,
      minAnnualRevenue: n(minRevenue) || 0,
      creditRequirements: creditReq,
      turnaroundDays: n(turnaround),
      contacts: lender?.contacts ?? [],
      submissionInstructions: instructions,
      integration,
      commission: { dealerFeePercent: n(dealerFee), financingFeeFlat: n(flatFee), notes: commNotes },
      requiredDocuments: docs,
      notes,
    };
    const res = actions.saveLender(next);
    if (res.ok) {
      toast.success(lender ? "Lender updated" : "Lender added");
      onDone(res.value);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{lender ? `Edit ${lender.name}` : "Add lender"}</DialogTitle>
        <DialogDescription>Lender profiles drive mock screening. Use fictional lenders in this demo.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Lender name" required error={errors.name} className="sm:col-span-2">
          {(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.name} />}
        </Field>
        <CheckGroup label="Countries served" options={[{ value: "US" as Country, label: "United States" }, { value: "CA" as Country, label: "Canada" }]} value={countries} onChange={setCountries} error={errors.countries} />
        <CheckGroup label="Currencies" options={[{ value: "USD" as Currency, label: "USD" }, { value: "CAD" as Currency, label: "CAD" }]} value={currencies} onChange={setCurrencies} error={errors.currencies} />
        <CheckGroup label="Customer types" options={(Object.keys(CUSTOMER_TYPE_LABEL) as CustomerType[]).map((v) => ({ value: v, label: CUSTOMER_TYPE_LABEL[v] }))} value={custTypes} onChange={setCustTypes} error={errors.custTypes} />
        <CheckGroup label="Products" options={(Object.keys(FINANCING_TYPE_LABEL) as FinancingType[]).map((v) => ({ value: v, label: FINANCING_TYPE_LABEL[v] }))} value={products} onChange={setProducts} error={errors.products} />
        <div className="sm:col-span-2">
          <CheckGroup label="Robot categories financed" options={(Object.keys(ROBOT_CATEGORY_LABEL) as RobotCategory[]).map((v) => ({ value: v, label: ROBOT_CATEGORY_LABEL[v] }))} value={cats} onChange={setCats} />
        </div>
        <Field label="Minimum amount" error={errors.amount}>{(id) => <Input id={id} inputMode="decimal" value={minAmount} onChange={(e) => setMinAmount(e.target.value)} />}</Field>
        <Field label="Maximum amount">{(id) => <Input id={id} inputMode="decimal" value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} />}</Field>
        <Field label="Indicative rate — min (%)" error={errors.apr}>{(id) => <Input id={id} inputMode="decimal" value={aprMin} onChange={(e) => setAprMin(e.target.value)} />}</Field>
        <Field label="Indicative rate — max (%)">{(id) => <Input id={id} inputMode="decimal" value={aprMax} onChange={(e) => setAprMax(e.target.value)} />}</Field>
        <div className="sm:col-span-2">
          <CheckGroup label="Available terms (months)" options={TERM_OPTIONS.map((t) => ({ value: t, label: String(t) }))} value={terms} onChange={setTerms} error={errors.terms} />
        </div>
        <Field label="Minimum credit profile">
          {(id) => (
            <Select value={minCredit} onValueChange={(v) => setMinCredit(v as CreditProfile)}>
              <SelectTrigger id={id} className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(CREDIT_LABEL) as CreditProfile[]).map((c) => <SelectItem key={c} value={c}>{CREDIT_LABEL[c]}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </Field>
        <Field label="Typical turnaround (days)" error={errors.turnaround}>{(id) => <Input id={id} inputMode="numeric" value={turnaround} onChange={(e) => setTurnaround(e.target.value)} />}</Field>
        <Field label="Min. years in business">{(id) => <Input id={id} inputMode="numeric" value={minYears} onChange={(e) => setMinYears(e.target.value)} />}</Field>
        <Field label="Min. annual revenue">{(id) => <Input id={id} inputMode="decimal" value={minRevenue} onChange={(e) => setMinRevenue(e.target.value)} />}</Field>
        <Field label="Credit requirements (notes)" className="sm:col-span-2">{(id) => <Textarea id={id} rows={2} value={creditReq} onChange={(e) => setCreditReq(e.target.value)} />}</Field>
        <div className="sm:col-span-2">
          <CheckGroup label="Required documents" options={(Object.keys(DOCUMENT_TYPE_LABEL) as DocumentType[]).map((v) => ({ value: v, label: DOCUMENT_TYPE_LABEL[v] }))} value={docs} onChange={setDocs} />
        </div>
        <Field label="Integration method" className="sm:col-span-2" hint="“API Connected” is a demo label — this prototype never calls a lender API.">
          {(id) => (
            <Select value={integration} onValueChange={(v) => setIntegration(v as IntegrationMethod)}>
              <SelectTrigger id={id} className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(INTEGRATION_LABEL) as IntegrationMethod[]).map((m) => <SelectItem key={m} value={m}>{INTEGRATION_LABEL[m]}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </Field>
        <Field label="Submission instructions" className="sm:col-span-2">{(id) => <Textarea id={id} rows={2} value={instructions} onChange={(e) => setInstructions(e.target.value)} />}</Field>
        <Field label="Dealer fee (% of funded amount)" error={errors.dealerFee} hint="Paid to the dealership by the lender; independent of interest.">{(id) => <Input id={id} inputMode="decimal" value={dealerFee} onChange={(e) => setDealerFee(e.target.value)} />}</Field>
        <Field label="Flat financing fee per funded deal" error={errors.flatFee}>{(id) => <Input id={id} inputMode="decimal" value={flatFee} onChange={(e) => setFlatFee(e.target.value)} />}</Field>
        <Field label="Commission notes" className="sm:col-span-2">{(id) => <Input id={id} value={commNotes} onChange={(e) => setCommNotes(e.target.value)} />}</Field>
        <Field label="Internal notes" className="sm:col-span-2">{(id) => <Textarea id={id} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />}</Field>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => onDone()}>Cancel</Button>
        <Button onClick={save}>{lender ? "Save changes" : "Add lender"}</Button>
      </DialogFooter>
    </>
  );
}

/* ------------------------------- program ----------------------------- */

export function ProgramDialog({ open, onOpenChange, lender, program }: { open: boolean; onOpenChange: (o: boolean) => void; lender: Lender; program?: LenderProgram }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <ProgramForm lender={lender} program={program} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function ProgramForm({ lender, program, onDone }: { lender: Lender; program?: LenderProgram; onDone: () => void }) {
  const { actions } = useStore();
  const [name, setName] = useState(program?.name ?? "");
  const [product, setProduct] = useState<FinancingType>(program?.product ?? lender.products[0] ?? "loan");
  const [custTypes, setCustTypes] = useState<CustomerType[]>(program?.customerTypes ?? lender.customerTypes);
  const [minAmount, setMinAmount] = useState(String(program?.minAmount ?? lender.minAmount));
  const [maxAmount, setMaxAmount] = useState(String(program?.maxAmount ?? lender.maxAmount));
  const [terms, setTerms] = useState<number[]>(program?.terms ?? lender.terms);
  const [aprMin, setAprMin] = useState(String(program?.aprMin ?? lender.aprMin));
  const [aprMax, setAprMax] = useState(String(program?.aprMax ?? lender.aprMax));
  const [resMin, setResMin] = useState(String(program?.residualMinPercent ?? ""));
  const [resMax, setResMax] = useState(String(program?.residualMaxPercent ?? ""));
  const [minCredit, setMinCredit] = useState<CreditProfile>(program?.minCredit ?? lender.minCredit);
  const [active, setActive] = useState(program?.active ?? true);
  const [description, setDescription] = useState(program?.description ?? "");

  const save = () => {
    if (!custTypes.length) return void toast.error("Select at least one customer type.");
    const res = actions.saveProgram({
      id: program?.id ?? uid("prg"),
      lenderId: lender.id,
      name: name.trim(),
      product,
      customerTypes: custTypes,
      minAmount: n(minAmount) || 0,
      maxAmount: n(maxAmount) || 0,
      terms: [...terms].sort((a, b) => a - b),
      aprMin: n(aprMin) || 0,
      aprMax: n(aprMax) || 0,
      residualMinPercent: product === "lease" && !Number.isNaN(n(resMin)) ? n(resMin) : undefined,
      residualMaxPercent: product === "lease" && !Number.isNaN(n(resMax)) ? n(resMax) : undefined,
      minCredit,
      active,
      description,
    });
    if (res.ok) {
      toast.success(program ? "Program updated" : "Program added");
      onDone();
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{program ? "Edit financing program" : "Add financing program"}</DialogTitle>
        <DialogDescription>Programs refine a lender&apos;s eligibility for a specific product — screening uses the best-fitting active program.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Program name" required className="sm:col-span-2">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label="Product">
          {(id) => (
            <Select value={product} onValueChange={(v) => setProduct(v as FinancingType)}>
              <SelectTrigger id={id} className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(FINANCING_TYPE_LABEL) as FinancingType[]).map((p) => <SelectItem key={p} value={p}>{FINANCING_TYPE_LABEL[p]}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </Field>
        <Field label="Minimum credit profile">
          {(id) => (
            <Select value={minCredit} onValueChange={(v) => setMinCredit(v as CreditProfile)}>
              <SelectTrigger id={id} className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(CREDIT_LABEL) as CreditProfile[]).map((c) => <SelectItem key={c} value={c}>{CREDIT_LABEL[c]}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </Field>
        <Field label="Minimum amount">{(id) => <Input id={id} inputMode="decimal" value={minAmount} onChange={(e) => setMinAmount(e.target.value)} />}</Field>
        <Field label="Maximum amount">{(id) => <Input id={id} inputMode="decimal" value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} />}</Field>
        <Field label="Rate — min (%)">{(id) => <Input id={id} inputMode="decimal" value={aprMin} onChange={(e) => setAprMin(e.target.value)} />}</Field>
        <Field label="Rate — max (%)">{(id) => <Input id={id} inputMode="decimal" value={aprMax} onChange={(e) => setAprMax(e.target.value)} />}</Field>
        {product === "lease" && (
          <>
            <Field label="Residual — min (% of price)">{(id) => <Input id={id} inputMode="decimal" value={resMin} onChange={(e) => setResMin(e.target.value)} />}</Field>
            <Field label="Residual — max (% of price)">{(id) => <Input id={id} inputMode="decimal" value={resMax} onChange={(e) => setResMax(e.target.value)} />}</Field>
          </>
        )}
        <div className="sm:col-span-2"><CheckGroup label="Customer types" options={(Object.keys(CUSTOMER_TYPE_LABEL) as CustomerType[]).map((v) => ({ value: v, label: CUSTOMER_TYPE_LABEL[v] }))} value={custTypes} onChange={setCustTypes} /></div>
        <div className="sm:col-span-2"><CheckGroup label="Terms (months)" options={TERM_OPTIONS.map((t) => ({ value: t, label: String(t) }))} value={terms} onChange={setTerms} /></div>
        <Field label="Description" className="sm:col-span-2">{(id) => <Textarea id={id} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />}</Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <Checkbox checked={active} onCheckedChange={(v) => setActive(v === true)} /> Program is active
        </label>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>Cancel</Button>
        <Button onClick={save}>{program ? "Save changes" : "Add program"}</Button>
      </DialogFooter>
    </>
  );
}

/* ------------------------------- contact ----------------------------- */

export function ContactDialog({ open, onOpenChange, lender, contact }: { open: boolean; onOpenChange: (o: boolean) => void; lender: Lender; contact?: LenderContact }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <ContactForm lender={lender} contact={contact} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function ContactForm({ lender, contact, onDone }: { lender: Lender; contact?: LenderContact; onDone: () => void }) {
  const { actions } = useStore();
  const [name, setName] = useState(contact?.name ?? "");
  const [title, setTitle] = useState(contact?.title ?? "");
  const [email, setEmail] = useState(contact?.email ?? "");
  const [phone, setPhone] = useState(contact?.phone ?? "");
  const [primary, setPrimary] = useState(contact?.primary ?? lender.contacts.length === 0);
  const save = () => {
    if (name.trim().length < 2) return void toast.error("Enter the contact's name.");
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return void toast.error("Enter a valid email.");
    const c: LenderContact = { id: contact?.id ?? uid("ct"), name: name.trim(), title, email: email.trim(), phone, primary };
    const others = lender.contacts.filter((x) => x.id !== c.id).map((x) => (primary ? { ...x, primary: false } : x));
    const res = actions.saveLender({ ...lender, contacts: [...others, c].sort((a, b) => Number(b.primary) - Number(a.primary)) });
    if (res.ok) {
      toast.success("Contact saved");
      onDone();
    }
  };
  return (
    <>
      <DialogHeader>
        <DialogTitle>{contact ? "Edit contact" : "Add contact"}</DialogTitle>
        <DialogDescription>Fictional contacts only.</DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <Field label="Name" required>{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label="Title">{(id) => <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} />}</Field>
        <Field label="Email" required>{(id) => <Input id={id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
        <Field label="Phone">{(id) => <Input id={id} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />}</Field>
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={primary} onCheckedChange={(v) => setPrimary(v === true)} /> Primary contact</label>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>Cancel</Button>
        <Button onClick={save}>Save contact</Button>
      </DialogFooter>
    </>
  );
}

export function SimulationNote() {
  return <Callout tone="info">API Ready / API Connected are demo labels. No lender API is called from this prototype.</Callout>;
}
