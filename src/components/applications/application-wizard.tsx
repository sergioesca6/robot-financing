"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight, Check, Plus, Save, Sparkles, UserRoundCheck } from "lucide-react";
import { toast } from "sonner";
import { NumField, SelectField, TextField } from "@/components/forms/fields";
import { DocumentCard } from "@/components/documents/document-card";
import { Callout, DataRow, PageHeader, SectionCard } from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CREDIT_LABEL,
  CUSTOMER_TYPE_LABEL,
  DOCUMENT_TYPE_LABEL,
  EMPLOYMENT_LABEL,
  FINANCING_TYPE_LABEL,
  INDUSTRIES,
  OWNERSHIP_LABEL,
  ROBOT_CATEGORY_LABEL,
  TERM_OPTIONS,
  regionsFor,
} from "@/domain/labels";
import type { Customer, DocumentType, FinancingApplication } from "@/domain/types";
import { leasePaymentFromCap, loanPayment, purchaseTotal, requestedAmount } from "@/lib/finance";
import { formatMoney } from "@/lib/format";
import { matchLenders, type MatchInput } from "@/lib/matching";
import { documentCompleteness, customerDisplayName } from "@/lib/selectors";
import { defaultDocumentDrafts, type DocumentDraft } from "@/lib/workflow";
import { cn } from "@/lib/utils";
import { MOCK_DEAL_PAYLOAD, prefillFromDeal } from "@/services/robot-trader";
import { USD_TO_CAD } from "@/data/reference";
import { useStore } from "@/store/store";
import { LenderMatchList } from "./lender-matches";
import { EMPTY_VALUES, STEP_FIELDS, STEP_LABELS, valuesFromApplication, wizardSchema, type WizardValues } from "./wizard-schema";

const DOC_ADD_OPTIONS: DocumentType[] = ["lender_additional", "insurance", "financial_statements", "business_registration", "proof_of_income", "identification"];

export function ApplicationWizard({ applicationId, initialCustomerId }: { applicationId?: string; initialCustomerId?: string }) {
  const { data, actions, can, currentUser } = useStore();
  const router = useRouter();
  const existingApp = applicationId ? data.applications.find((a) => a.id === applicationId) : undefined;
  const existingCustomer = existingApp ? data.customers.find((c) => c.id === existingApp.customerId) : undefined;

  const defaults = useMemo<WizardValues>(() => {
    if (existingApp && existingCustomer) return valuesFromApplication(existingApp, existingCustomer);
    const country = data.settings.dealership.defaultCountry;
    const base: WizardValues = {
      ...EMPTY_VALUES,
      country,
      currency: country === "CA" ? "CAD" : "USD",
      preferredTermMonths: data.settings.financingDefaults.loanTermMonths,
      assignedEmployeeId: currentUser.id,
    };
    const pre = initialCustomerId ? data.customers.find((c) => c.id === initialCustomerId) : undefined;
    if (pre) {
      return {
        ...base,
        customerMode: "existing",
        customerId: pre.id,
        customerType: pre.type,
        name: pre.name,
        companyName: pre.companyName ?? "",
        email: pre.email,
        phone: pre.phone,
        country: pre.country,
        currency: pre.country === "CA" ? "CAD" : "USD",
        region: pre.region,
        address: pre.address,
        industry: pre.industry,
        yearsInBusiness: pre.yearsInBusiness,
        assignedEmployeeId: pre.assignedEmployeeId,
      };
    }
    return base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const form = useForm<WizardValues>({ resolver: zodResolver(wizardSchema), defaultValues: defaults, mode: "onTouched" });
  const { control, setValue, getValues, trigger, handleSubmit, reset } = form;
  const v = useWatch({ control }) as WizardValues;

  const [step, setStep] = useState(existingApp?.status === "draft" ? Math.min(existingApp.wizardStep ?? 0, 5) : 0);
  const [maxStep, setMaxStep] = useState(existingApp?.status === "draft" ? Math.min(existingApp.wizardStep ?? 0, 5) : existingApp ? 5 : 0);
  const [docs, setDocs] = useState<DocumentDraft[]>(() =>
    existingApp
      ? data.documents
          .filter((d) => d.applicationId === existingApp.id)
          .map((d) => ({ id: d.id, type: d.type, label: d.label, required: d.required, status: d.status, fileName: d.fileName, fileSize: d.fileSize, mimeType: d.mimeType, note: d.note }))
      : defaultDocumentDrafts(defaults.customerType),
  );
  const [draftId, setDraftId] = useState<string | undefined>(existingApp?.id);
  const [robotTrader, setRobotTrader] = useState<FinancingApplication["robotTrader"]>(existingApp?.robotTrader);
  const [note, setNote] = useState("");
  const [addDocType, setAddDocType] = useState<string>("lender_additional");
  const editingNonDraft = !!existingApp && existingApp.status !== "draft";
  const locked = v.customerMode === "existing";

  const total = purchaseTotal({ quantity: v.quantity || 0, unitPrice: v.unitPrice || 0, installationCost: v.installationCost || 0, shippingCost: v.shippingCost || 0 });
  const requested = requestedAmount(total, v.downPayment || 0, v.tradeInCredit || 0);
  const fd = data.settings.financingDefaults;
  const estimate = useMemo(() => {
    if (!(requested > 0) || !(v.preferredTermMonths > 0)) return null;
    if (v.financingType === "loan") {
      return { monthly: loanPayment(requested, fd.loanApr, v.preferredTermMonths), basis: `Loan at ${fd.loanApr}% APR (Settings default), ${v.preferredTermMonths} months` };
    }
    const residual = (total * fd.leaseResidualPercent) / 100;
    return {
      monthly: leasePaymentFromCap(requested, residual, fd.leaseMoneyFactor, v.preferredTermMonths).payment,
      basis: `Lease with money factor ${fd.leaseMoneyFactor} and ${fd.leaseResidualPercent}% residual (Settings defaults), ${v.preferredTermMonths} months`,
    };
  }, [requested, total, v.financingType, v.preferredTermMonths, fd]);

  const completeness = documentCompleteness(docs.map((d, i) => ({ ...d, id: d.id ?? `d${i}`, applicationId: "x", label: d.label ?? DOCUMENT_TYPE_LABEL[d.type], checklist: [] })));

  const matchInput: MatchInput = {
    country: v.country,
    currency: v.currency,
    customerType: v.customerType,
    financingType: v.financingType,
    requestedAmount: requested,
    termMonths: v.preferredTermMonths,
    category: v.category,
    profile: { credit: v.credit, annualRevenue: v.annualRevenue, yearsOperating: v.yearsOperating },
    yearsInBusiness: v.yearsInBusiness,
  };
  const matches = step === 5 ? matchLenders(matchInput, data.lenders, data.programs) : [];

  const emailDup = useMemo(() => {
    if (locked || !v.email) return undefined;
    return data.customers.find((c) => c.email.toLowerCase() === v.email.trim().toLowerCase());
  }, [data.customers, locked, v.email]);

  const linkExisting = (c: Customer) => {
    reset({
      ...getValues(),
      customerMode: "existing",
      customerId: c.id,
      customerType: c.type,
      name: c.name,
      companyName: c.companyName ?? "",
      email: c.email,
      phone: c.phone,
      country: c.country,
      region: c.region,
      address: c.address,
      industry: c.industry,
      yearsInBusiness: c.yearsInBusiness,
      currency: c.country === "CA" ? "CAD" : "USD",
      assignedEmployeeId: c.assignedEmployeeId,
    });
    setDocs(defaultDocumentDrafts(c.type));
  };

  const clearExisting = () => {
    reset({ ...EMPTY_VALUES, ...getValues(), customerMode: "new", customerId: undefined, name: "", companyName: "", email: "", phone: "", region: "", address: "", industry: undefined, yearsInBusiness: undefined });
  };

  const buildInput = (status: "draft" | "needs_documents" | "ready_to_submit") => {
    const val = getValues();
    const newCustomer =
      val.customerMode === "new"
        ? {
            type: val.customerType,
            name: val.name,
            companyName: val.customerType === "business" ? val.companyName : undefined,
            email: val.email,
            phone: val.phone,
            country: val.country,
            region: val.region,
            address: val.address,
            industry: val.customerType === "business" ? val.industry : undefined,
            yearsInBusiness: val.customerType === "business" ? val.yearsInBusiness : undefined,
            assignedEmployeeId: val.assignedEmployeeId || undefined,
            robotTraderCustomerId: robotTrader?.customerId,
          }
        : undefined;
    return {
      id: draftId,
      customerId: val.customerMode === "existing" ? val.customerId : undefined,
      newCustomer: draftId ? undefined : newCustomer,
      financingType: val.financingType,
      currency: val.currency,
      country: val.country,
      robot: {
        catalogId: val.catalogId,
        manufacturer: val.manufacturer,
        model: val.model,
        category: val.category,
        condition: val.condition,
        quantity: val.quantity || 1,
        unitPrice: val.unitPrice || 0,
        installationCost: val.installationCost || 0,
        shippingCost: val.shippingCost || 0,
        robotTraderListingId: robotTrader?.listingId,
      },
      downPayment: val.downPayment || 0,
      tradeInCredit: val.tradeInCredit || 0,
      preferredTermMonths: val.preferredTermMonths || 60,
      desiredMonthlyPayment: val.desiredMonthlyPayment,
      profile: {
        credit: val.credit,
        annualRevenue: val.customerType === "business" ? val.annualRevenue : undefined,
        yearsOperating: val.customerType === "business" ? val.yearsOperating : undefined,
        ownership: val.customerType === "business" ? val.ownership : undefined,
        employment: val.customerType === "individual" ? val.employment : undefined,
        annualIncome: val.customerType === "individual" ? val.annualIncome : undefined,
      },
      assignedEmployeeId: val.assignedEmployeeId || undefined,
      status,
      wizardStep: step,
      documents: docs,
      robotTrader,
    };
  };

  // When a draft is first created from a *new* customer, subsequent saves must link to that customer.
  const persist = (status: "draft" | "needs_documents" | "ready_to_submit") => {
    const input = buildInput(status);
    if (draftId && existingApp === undefined) {
      const app = data.applications.find((a) => a.id === draftId);
      if (app) input.customerId = app.customerId;
    }
    const res = actions.saveApplication(input as Parameters<typeof actions.saveApplication>[0]);
    if (res.ok && !draftId) setDraftId(res.value.id);
    return res;
  };

  const saveDraft = async () => {
    const ok = await trigger(["customerType", "name", "email"]);
    if (!ok || (getValues("customerType") === "business" && !getValues("companyName"))) {
      setStep(0);
      if (getValues("customerType") === "business" && !getValues("companyName")) await trigger("companyName");
      return void toast.error("Enter the customer's name and email before saving a draft.");
    }
    const res = persist("draft");
    if (res.ok) toast.success(`Draft saved as ${res.value.id}`, { description: "Resume any time from Applications → Drafts." });
  };

  const next = async () => {
    const fields = STEP_FIELDS[step] ?? [];
    const ok = fields.length ? await trigger(fields) : true;
    if (!ok) return void toast.error("Please fix the highlighted fields to continue.");
    setStep(step + 1);
    setMaxStep((m) => Math.max(m, step + 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const finish = handleSubmit(
    () => {
      const status = editingNonDraft ? undefined : completeness.missing.length ? "needs_documents" : "ready_to_submit";
      const res = persist(status ?? "draft");
      if (res.ok) {
        if (note.trim()) actions.addApplicationNote(res.value.id, note.trim());
        toast.success(editingNonDraft ? "Changes saved" : status === "ready_to_submit" ? `${res.value.id} is ready to submit` : `${res.value.id} saved as Needs Documents`);
        router.push(`/applications/${res.value.id}`);
      }
    },
    (errors) => {
      const firstField = Object.keys(errors)[0] as keyof WizardValues | undefined;
      const idx = STEP_FIELDS.findIndex((f) => firstField && f.includes(firstField));
      if (idx >= 0) setStep(idx);
      toast.error("Some required fields are missing or invalid.");
    },
  );

  if (applicationId && !existingApp) {
    return <Callout tone="danger">Application {applicationId} was not found.</Callout>;
  }
  if (!can(applicationId ? "application.edit" : "application.create")) {
    return <Callout tone="warning" title="Not available for your demo role">Switch to Administrator, Finance Manager or Sales Representative as appropriate (UI simulation only).</Callout>;
  }

  const rtPrefill = () => {
    const p = prefillFromDeal(MOCK_DEAL_PAYLOAD);
    reset({
      ...EMPTY_VALUES,
      customerMode: "new",
      customerType: p.customerType,
      name: p.name,
      companyName: p.companyName,
      email: p.email,
      phone: p.phone,
      country: p.country,
      region: p.region,
      address: "",
      manufacturer: p.manufacturer,
      model: p.model,
      category: p.category,
      condition: p.condition,
      quantity: p.quantity,
      unitPrice: p.unitPrice,
      currency: p.currency,
      assignedEmployeeId: currentUser.id,
      preferredTermMonths: fd.loanTermMonths,
    });
    setRobotTrader(p.robotTrader);
    setDocs(defaultDocumentDrafts(p.customerType));
    toast.success("Prefilled from a mock Robot Trader deal", { description: "Demo payload only — no cross-app call was made." });
  };

  const regionOptions = Object.entries(regionsFor(v.country)).map(([value, label]) => ({ value, label }));
  const symbol = v.currency === "CAD" ? "C$" : "$";

  return (
    <FormProvider {...form}>
      <PageHeader
        title={applicationId ? `Edit ${applicationId}` : "New financing application"}
        description={editingNonDraft ? "Update customer, robot and financing details. Status and lender activity are unchanged." : "Capture the deal once; reuse it for lender matching, submissions and offers."}
        actions={
          <>
            {!applicationId && (
              <Button variant="outline" onClick={rtPrefill}>
                <Sparkles /> Prefill from Robot Trader (mock)
              </Button>
            )}
            {!editingNonDraft && (
              <Button variant="outline" onClick={saveDraft}>
                <Save /> Save draft
              </Button>
            )}
          </>
        }
      />

      {robotTrader?.dealId && (
        <Callout tone="info" className="mb-4" title="Linked Robot Trader deal (mock)">
          Customer {robotTrader.customerId} · listing {robotTrader.listingId} · deal {robotTrader.dealId}. These IDs will sync financing status back to Robot Trader in a future integration.
        </Callout>
      )}

      <ol className="mb-5 flex items-center gap-1 overflow-x-auto rounded-xl border bg-card p-2" aria-label="Application steps">
        {STEP_LABELS.map((label, i) => {
          const done = i < step || (i <= maxStep && i !== step);
          const reachable = i <= maxStep;
          return (
            <li key={label} className="flex min-w-0 flex-1 items-center">
              <button
                type="button"
                disabled={!reachable}
                onClick={() => setStep(i)}
                aria-current={i === step ? "step" : undefined}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] font-medium transition-colors",
                  i === step ? "bg-primary text-primary-foreground" : reachable ? "text-foreground hover:bg-muted" : "text-muted-foreground/60",
                )}
              >
                <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full text-[11px]", i === step ? "bg-white/20" : done ? "bg-emerald-100 text-emerald-700" : "bg-muted")}>
                  {done && i !== step ? <Check className="size-3" /> : i + 1}
                </span>
                <span className="hidden truncate sm:inline">{label}</span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0 space-y-4">
          {step === 0 && (
            <SectionCard title="Customer" description="Select an existing customer to avoid duplicates, or enter a new one.">
              <div className="space-y-4">
                {!applicationId && (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/50 p-3">
                    <UserRoundCheck className="size-4 text-muted-foreground" aria-hidden />
                    <span className="text-sm">Existing customer</span>
                    <Select
                      value={v.customerMode === "existing" ? (v.customerId ?? "") : ""}
                      onValueChange={(id) => {
                        const c = data.customers.find((x) => x.id === id);
                        if (c) linkExisting(c);
                      }}
                    >
                      <SelectTrigger className="h-8 w-72 bg-card" aria-label="Select existing customer">
                        <SelectValue placeholder="Search customers…" />
                      </SelectTrigger>
                      <SelectContent>
                        {data.customers.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {customerDisplayName(c)} · {c.country}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {locked && (
                      <Button variant="ghost" size="sm" onClick={clearExisting}>
                        <Plus /> Enter a new customer
                      </Button>
                    )}
                  </div>
                )}
                {locked && (
                  <Callout tone="info">
                    Linked to existing customer record. Edit contact details on the{" "}
                    <Link className="font-medium underline" href={`/customers/${v.customerId}`}>
                      customer page
                    </Link>
                    .
                  </Callout>
                )}
                {emailDup && (
                  <Callout tone="warning" title="Possible duplicate customer">
                    <span>
                      {customerDisplayName(emailDup)} already uses this email.{" "}
                      <button type="button" className="font-medium underline" onClick={() => linkExisting(emailDup)}>
                        Use the existing customer
                      </button>
                    </span>
                  </Callout>
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                  <SelectField
                    name="customerType"
                    label="Customer type"
                    required
                    disabled={locked}
                    onValueChange={(t) => setDocs((cur) => (cur.some((d) => d.status !== "missing") || existingApp ? cur : defaultDocumentDrafts(t as "business" | "individual")))} options={Object.entries(CUSTOMER_TYPE_LABEL).map(([value, label]) => ({ value, label }))} />
                  <SelectField name="assignedEmployeeId" label="Assigned employee" required options={data.employees.filter((e) => e.active).map((e) => ({ value: e.id, label: e.name }))} />
                  <TextField name="name" label={v.customerType === "business" ? "Primary contact" : "Full name"} required disabled={locked} autoComplete="off" />
                  {v.customerType === "business" && <TextField name="companyName" label="Company name" required disabled={locked} />}
                  <TextField name="email" label="Email" type="email" required disabled={locked} />
                  <TextField name="phone" label="Phone" type="tel" required disabled={locked} />
                  <SelectField
                    name="country"
                    label="Country"
                    required
                    disabled={locked}
                    options={[{ value: "US", label: "United States" }, { value: "CA", label: "Canada" }]}
                    onValueChange={(c) => {
                      setValue("region", "");
                      setValue("currency", c === "CA" ? "CAD" : "USD");
                    }}
                  />
                  <SelectField name="region" label={v.country === "US" ? "State" : "Province"} required disabled={locked} options={regionOptions} />
                  <TextField name="address" label="Address" required disabled={locked} className="sm:col-span-2" />
                  {v.customerType === "business" && (
                    <>
                      <SelectField name="industry" label="Business industry" required disabled={locked} options={INDUSTRIES.map((i) => ({ value: i, label: i }))} />
                      <NumField name="yearsInBusiness" label="Years in business" required disabled={locked} suffix="yrs" min={0} />
                    </>
                  )}
                </div>
              </div>
            </SectionCard>
          )}

          {step === 1 && (
            <SectionCard title="Robot information" description="Pick from the demo catalog (illustrative pricing, not vendor quotes) or enter details manually.">
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField
                  name="catalogId"
                  label="Demo catalog"
                  className="sm:col-span-2"
                  placeholder="Choose a model to prefill…"
                  hint="Prices are illustrative demonstration figures."
                  options={data.robots.map((r) => ({ value: r.id, label: `${r.manufacturer} ${r.model} — ${ROBOT_CATEGORY_LABEL[r.category]}` }))}
                  onValueChange={(id) => {
                    const r = data.robots.find((x) => x.id === id);
                    if (!r) return;
                    setValue("manufacturer", r.manufacturer, { shouldValidate: true });
                    setValue("model", r.model, { shouldValidate: true });
                    setValue("category", r.category);
                    setValue("unitPrice", Math.round((r.listPriceUsd * (getValues("currency") === "CAD" ? USD_TO_CAD : 1)) / 100) * 100, { shouldValidate: true });
                  }}
                />
                <TextField name="manufacturer" label="Manufacturer" required />
                <TextField name="model" label="Model" required />
                <SelectField name="category" label="Category" required options={Object.entries(ROBOT_CATEGORY_LABEL).map(([value, label]) => ({ value, label }))} />
                <SelectField name="condition" label="Condition" required options={[{ value: "new", label: "New" }, { value: "used", label: "Used" }]} />
                <NumField name="quantity" label="Quantity" required step="1" min={1} />
                <NumField name="unitPrice" label="Unit price" required prefix={symbol} min={0} />
                <NumField name="installationCost" label="Installation / training (optional)" prefix={symbol} min={0} />
                <NumField name="shippingCost" label="Shipping (optional)" prefix={symbol} min={0} />
              </div>
              <div className="mt-4 flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3 text-sm">
                <span className="text-muted-foreground">Total purchase amount</span>
                <span className="tnum text-lg font-semibold">{formatMoney(total, v.currency)}</span>
              </div>
            </SectionCard>
          )}

          {step === 2 && (
            <SectionCard title="Financing details" description="Loan and lease structures are calculated separately.">
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField
                  name="financingType"
                  label="Financing type"
                  required
                  options={Object.entries(FINANCING_TYPE_LABEL).map(([value, label]) => ({ value, label }))}
                  onValueChange={(t) => setValue("preferredTermMonths", t === "lease" ? fd.leaseTermMonths : fd.loanTermMonths)}
                />
                <SelectField name="currency" label="Currency" required options={[{ value: "USD", label: "USD — US dollar" }, { value: "CAD", label: "CAD — Canadian dollar" }]} hint={v.currency !== (v.country === "CA" ? "CAD" : "USD") ? "Currency differs from the customer's country — lender matching will reflect this." : undefined} />
                <NumField name="downPayment" label="Down payment" required prefix={symbol} min={0} />
                <NumField name="tradeInCredit" label="Trade-in or other credits (optional)" prefix={symbol} min={0} />
                <SelectField
                  name="preferredTermMonths"
                  label="Preferred term"
                  required
                  options={[...new Set([...TERM_OPTIONS, v.preferredTermMonths].filter(Boolean))].sort((a, b) => a - b).map((t) => ({ value: String(t), label: `${t} months` }))}
                  hint="Select a standard term; custom terms from drafts are preserved."
                />
                <NumField name="desiredMonthlyPayment" label="Customer's desired monthly payment (optional)" prefix={symbol} min={0} />
              </div>
              <dl className="mt-4 divide-y rounded-lg bg-muted/50 px-4 py-1">
                <DataRow label="Total purchase amount">{formatMoney(total, v.currency)}</DataRow>
                <DataRow label="Down payment + credits">− {formatMoney((v.downPayment || 0) + (v.tradeInCredit || 0), v.currency)}</DataRow>
                <DataRow label="Requested financing" className="text-base">
                  <span className="tnum text-lg font-semibold">{formatMoney(requested, v.currency)}</span>
                </DataRow>
              </dl>
            </SectionCard>
          )}

          {step === 3 && (
            <SectionCard title="Financial profile" description={v.customerType === "business" ? "Business profile used for mock lender screening." : "Individual profile used for mock lender screening."}>
              <Callout tone="info" className="mb-4" title="Demo fields only">
                Do not enter real SSNs/SINs, banking credentials, account numbers or credit reports. The credit profile is an estimated band, not a credit pull.
              </Callout>
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField name="credit" label="Estimated credit profile" required options={Object.entries(CREDIT_LABEL).map(([value, label]) => ({ value, label }))} />
                {v.customerType === "business" ? (
                  <>
                    <NumField name="annualRevenue" label="Annual revenue" required prefix={symbol} min={0} />
                    <NumField name="yearsOperating" label="Years operating" required suffix="yrs" min={0} />
                    <SelectField name="ownership" label="Business ownership type" required options={Object.entries(OWNERSHIP_LABEL).map(([value, label]) => ({ value, label }))} />
                  </>
                ) : (
                  <>
                    <SelectField name="employment" label="Employment status" required options={Object.entries(EMPLOYMENT_LABEL).map(([value, label]) => ({ value, label }))} />
                    <NumField name="annualIncome" label="Approximate annual income" required prefix={symbol} min={0} />
                  </>
                )}
              </div>
            </SectionCard>
          )}

          {step === 4 && (
            <SectionCard
              title="Documents"
              description="Attach simulated documents and track what's received or verified."
              action={
                <div className="flex items-center gap-2">
                  <Select value={addDocType} onValueChange={setAddDocType}>
                    <SelectTrigger size="sm" className="w-52 bg-card" aria-label="Additional requirement type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DOC_ADD_OPTIONS.map((t) => (
                        <SelectItem key={t} value={t}>
                          {DOCUMENT_TYPE_LABEL[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDocs((d) => [...d, { type: addDocType as DocumentType, label: DOCUMENT_TYPE_LABEL[addDocType as DocumentType], required: true, status: "missing" }])}
                  >
                    <Plus /> Add
                  </Button>
                </div>
              }
            >
              <Callout tone="warning" className="mb-4" title="Demo-only upload">
                Files are not stored or transmitted. Only the file name, size and type are kept for this prototype. Use fictional documents.
              </Callout>
              <div className="mb-4 flex items-center gap-3">
                <Progress value={completeness.percentReceived} className="h-2 flex-1" aria-label="Documents received" />
                <span className="tnum text-xs text-muted-foreground">
                  {completeness.received}/{completeness.required} received · {completeness.verified} verified
                </span>
              </div>
              <div className="space-y-2.5">
                {docs.map((d, i) => (
                  <DocumentCard
                    key={`${d.type}-${i}`}
                    doc={{ ...d, label: d.label ?? DOCUMENT_TYPE_LABEL[d.type] }}
                    canManage
                    canVerify={can("submission.manage") || can("application.status")}
                    compact
                    onAttach={(meta) => setDocs((cur) => cur.map((x, xi) => (xi === i ? { ...x, ...meta, status: "uploaded", note: undefined } : x)))}
                    onSetStatus={(status, note) =>
                      setDocs((cur) =>
                        cur.map((x, xi) =>
                          xi === i ? { ...x, status, note: status === "rejected" ? note : undefined, ...(status === "missing" ? { fileName: undefined, fileSize: undefined, mimeType: undefined } : {}) } : x,
                        ),
                      )
                    }
                  />
                ))}
              </div>
            </SectionCard>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <SectionCard title="Application summary">
                <div className="grid gap-x-8 gap-y-1 md:grid-cols-2">
                  <dl>
                    <DataRow label="Customer">{v.customerType === "business" ? v.companyName : v.name}</DataRow>
                    <DataRow label="Type">{CUSTOMER_TYPE_LABEL[v.customerType]}</DataRow>
                    <DataRow label="Contact">{v.email}</DataRow>
                    <DataRow label="Location">
                      {v.region}, {v.country}
                    </DataRow>
                    <DataRow label="Credit profile">{CREDIT_LABEL[v.credit]}</DataRow>
                    <DataRow label="Assigned to">{data.employees.find((e) => e.id === v.assignedEmployeeId)?.name ?? "—"}</DataRow>
                  </dl>
                  <dl>
                    <DataRow label="Robot">
                      {v.manufacturer} {v.model} × {v.quantity}
                    </DataRow>
                    <DataRow label="Category / condition">
                      {ROBOT_CATEGORY_LABEL[v.category]} · {v.condition}
                    </DataRow>
                    <DataRow label="Purchase total">{formatMoney(total, v.currency)}</DataRow>
                    <DataRow label="Down payment + credits">{formatMoney((v.downPayment || 0) + (v.tradeInCredit || 0), v.currency)}</DataRow>
                    <DataRow label="Requested financing">
                      <strong>{formatMoney(requested, v.currency)}</strong>
                    </DataRow>
                    <DataRow label="Structure">
                      {FINANCING_TYPE_LABEL[v.financingType]} · {v.preferredTermMonths} mo · {v.currency}
                    </DataRow>
                  </dl>
                </div>
              </SectionCard>

              <div className="grid gap-4 md:grid-cols-2">
                <SectionCard title="Financing estimate">
                  {estimate ? (
                    <div className="space-y-2">
                      <p className="tnum text-2xl font-semibold">
                        {formatMoney(estimate.monthly, v.currency, { decimals: true })}
                        <span className="ml-1 text-sm font-normal text-muted-foreground">/ month (est.)</span>
                      </p>
                      <p className="text-xs text-muted-foreground">{estimate.basis}. Excludes taxes and lender fees. Estimate only — not an offer.</p>
                      {v.desiredMonthlyPayment ? (
                        <p className={cn("text-xs font-medium", estimate.monthly > v.desiredMonthlyPayment ? "text-amber-700" : "text-emerald-700")}>
                          Customer target {formatMoney(v.desiredMonthlyPayment, v.currency)} — estimate is {estimate.monthly > v.desiredMonthlyPayment ? "above" : "within"} target.
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Enter financing details to see an estimate.</p>
                  )}
                </SectionCard>
                <SectionCard title="Missing information">
                  {completeness.missing.length === 0 && v.credit !== "unknown" ? (
                    <p className="flex items-center gap-2 text-sm text-emerald-700">
                      <Check className="size-4" /> Nothing missing — ready for lenders.
                    </p>
                  ) : (
                    <ul className="space-y-1.5 text-sm">
                      {completeness.missing.map((m, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber-500" />
                          {m.label} {m.status === "rejected" ? "(rejected)" : "not received"}
                        </li>
                      ))}
                      {v.credit === "unknown" && (
                        <li className="flex items-start gap-2">
                          <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber-500" />
                          Credit profile not assessed
                        </li>
                      )}
                    </ul>
                  )}
                </SectionCard>
              </div>

              <SectionCard title="Potential lender matches" description="Explained by readable criteria. Expand a lender to see why.">
                <LenderMatchList matches={matches} />
              </SectionCard>

              <SectionCard title="Notes (optional)">
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} aria-label="Internal note" placeholder="Anything lenders or teammates should know…" />
              </SectionCard>
            </div>
          )}

          <div className="flex items-center justify-between rounded-xl border bg-card p-3">
            <Button variant="ghost" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>
              <ArrowLeft /> Back
            </Button>
            <div className="flex items-center gap-2">
              {!editingNonDraft && step < 5 && (
                <Button variant="outline" onClick={saveDraft}>
                  <Save /> Save draft
                </Button>
              )}
              {step < 5 ? (
                <Button onClick={next}>
                  Next <ArrowRight />
                </Button>
              ) : (
                <Button onClick={finish}>
                  <Check />
                  {editingNonDraft ? "Save changes" : completeness.missing.length ? "Save as Needs Documents" : "Mark ready for submission"}
                </Button>
              )}
            </div>
          </div>
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-20 space-y-3">
            <SectionCard title="Deal summary">
              <dl className="-my-1">
                <DataRow label="Robot">{v.model ? `${v.manufacturer} ${v.model}` : "—"}</DataRow>
                <DataRow label="Purchase total">{formatMoney(total, v.currency)}</DataRow>
                <DataRow label="Requested">
                  <strong>{formatMoney(requested, v.currency)}</strong>
                </DataRow>
                <DataRow label="Structure">
                  {FINANCING_TYPE_LABEL[v.financingType]} · {v.preferredTermMonths} mo
                </DataRow>
                <DataRow label="Est. payment">{estimate ? `${formatMoney(estimate.monthly, v.currency)}/mo` : "—"}</DataRow>
              </dl>
              <p className="mt-3 border-t pt-3 text-[11px] leading-relaxed text-muted-foreground">Estimates use Settings defaults and exclude taxes and fees. Not a credit decision.</p>
            </SectionCard>
            <SectionCard title="Documents">
              <div className="flex items-center gap-2">
                <Progress value={completeness.percentReceived} className="h-1.5 flex-1" aria-label="Document completeness" />
                <span className="tnum text-xs text-muted-foreground">
                  {completeness.received}/{completeness.required}
                </span>
              </div>
            </SectionCard>
            {draftId && (
              <p className="text-center text-xs text-muted-foreground">
                Draft saved as <span className="font-mono">{draftId}</span>
              </p>
            )}
          </div>
        </aside>
      </div>
    </FormProvider>
  );
}
