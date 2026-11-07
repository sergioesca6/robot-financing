"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Pencil, Plus, RotateCcw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { CheckGroup } from "@/components/lenders/lender-dialogs";
import { Callout, ConfirmDialog, DataRow, Field, PageHeader, PersonAvatar, SectionCard } from "@/components/shared/page";
import { Pill } from "@/components/shared/badges";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ROLE_LABEL } from "@/domain/labels";
import { PERMISSION_LABEL, ROLE_PERMISSIONS, type Permission } from "@/domain/permissions";
import type { AppSettings, Country, Employee, EmailTemplate, Role } from "@/domain/types";
import { uid } from "@/lib/id";
import { renderTemplate, TEMPLATE_VARIABLES } from "@/services/email";
import { MOCK_DEAL_PAYLOAD, statusUpdateFor } from "@/services/robot-trader";
import { useStore } from "@/store/store";

const TABS = ["dealership", "employees", "financing", "commissions", "templates", "integrations", "demo"];

export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <Page />
    </Suspense>
  );
}

function Page() {
  const { can } = useStore();
  const router = useRouter();
  const params = useSearchParams();
  const t = params.get("tab");
  const tab = TABS.includes(t ?? "") ? (t as string) : "dealership";
  const manage = can("settings.manage");
  return (
    <>
      <PageHeader title="Settings" description="Dealership configuration, defaults and demo controls. Stored in this browser only." />
      {!manage && (
        <Callout tone="info" className="mb-4">
          Settings are read-only for your demo role. Switch to Administrator from the profile menu to edit (UI simulation only).
        </Callout>
      )}
      <Tabs value={tab} onValueChange={(v) => router.replace(`/settings?tab=${v}`, { scroll: false })}>
        <TabsList className="mb-4 h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="dealership">Dealership</TabsTrigger>
          <TabsTrigger value="employees">Employees</TabsTrigger>
          <TabsTrigger value="financing">Financing defaults</TabsTrigger>
          <TabsTrigger value="commissions">Commission rules</TabsTrigger>
          <TabsTrigger value="templates">Email templates</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
          <TabsTrigger value="demo">Demo &amp; roles</TabsTrigger>
        </TabsList>
        <TabsContent value="dealership"><Dealership manage={manage} /></TabsContent>
        <TabsContent value="employees"><Employees manage={manage} /></TabsContent>
        <TabsContent value="financing"><FinancingDefaults manage={manage} /></TabsContent>
        <TabsContent value="commissions"><CommissionRules manage={manage} /></TabsContent>
        <TabsContent value="templates"><Templates manage={manage} /></TabsContent>
        <TabsContent value="integrations"><Integrations /></TabsContent>
        <TabsContent value="demo"><Demo /></TabsContent>
      </Tabs>
    </>
  );
}

/* ----------------------------- dealership ---------------------------- */

function Dealership({ manage }: { manage: boolean }) {
  const { data, actions } = useStore();
  const d = data.settings.dealership;
  const [f, setF] = useState(d);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const save = () => {
    if (f.name.trim().length < 2) return void toast.error("Enter the dealership name.");
    if (!/^\S+@\S+\.\S+$/.test(f.email)) return void toast.error("Enter a valid email.");
    if (!f.countries.length) return void toast.error("Select at least one country.");
    const dc = f.countries.includes(f.defaultCountry) ? f.defaultCountry : f.countries[0]!;
    actions.updateSettings((s) => ({ ...s, dealership: { ...f, defaultCountry: dc } }));
    toast.success("Dealership profile saved");
  };
  return (
    <SectionCard title="Dealership profile" description="Shown on emails and used for default country.">
      <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
        <Field label="Display name" required>{(id) => <Input id={id} value={f.name} onChange={(e) => set("name", e.target.value)} disabled={!manage} />}</Field>
        <Field label="Legal name">{(id) => <Input id={id} value={f.legalName} onChange={(e) => set("legalName", e.target.value)} disabled={!manage} />}</Field>
        <Field label="Contact email" required>{(id) => <Input id={id} type="email" value={f.email} onChange={(e) => set("email", e.target.value)} disabled={!manage} />}</Field>
        <Field label="Phone">{(id) => <Input id={id} value={f.phone} onChange={(e) => set("phone", e.target.value)} disabled={!manage} />}</Field>
        <Field label="Address" className="sm:col-span-2">{(id) => <Input id={id} value={f.address} onChange={(e) => set("address", e.target.value)} disabled={!manage} />}</Field>
        <CheckGroup<Country> label="Countries served" options={[{ value: "US", label: "United States" }, { value: "CA", label: "Canada" }]} value={f.countries} onChange={(v) => set("countries", v)} />
        <Field label="Default country">
          {(id) => (
            <Select value={f.defaultCountry} onValueChange={(v) => set("defaultCountry", v as Country)} disabled={!manage}>
              <SelectTrigger id={id} className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="US">United States</SelectItem>
                <SelectItem value="CA">Canada</SelectItem>
              </SelectContent>
            </Select>
          )}
        </Field>
      </div>
      <Button className="mt-4" onClick={save} disabled={!manage}>Save profile</Button>
    </SectionCard>
  );
}

/* ------------------------------ employees ---------------------------- */

function Employees({ manage }: { manage: boolean }) {
  const { data, actions } = useStore();
  const [edit, setEdit] = useState<Employee | "new" | null>(null);
  return (
    <SectionCard
      title="Employee directory"
      description="Used for assignment, commissions and the demo role switcher."
      flush
      action={<Button size="sm" onClick={() => setEdit("new")} disabled={!manage}><Plus /> Add employee</Button>}
    >
      <div className="overflow-x-auto">
        <Table className="min-w-[700px] text-[13px]">
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="text-xs">Name</TableHead><TableHead className="text-xs">Role</TableHead><TableHead className="text-xs">Title</TableHead><TableHead className="text-xs">Country</TableHead><TableHead className="text-xs">Status</TableHead><TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.employees.map((e) => (
              <TableRow key={e.id}>
                <TableCell>
                  <span className="flex items-center gap-2"><PersonAvatar name={e.name} /><span><span className="block font-medium">{e.name}</span><span className="text-xs text-muted-foreground">{e.email}</span></span></span>
                </TableCell>
                <TableCell>{ROLE_LABEL[e.role]}</TableCell>
                <TableCell>{e.title}</TableCell>
                <TableCell>{e.country}</TableCell>
                <TableCell><Pill tone={e.active ? "success" : "neutral"}>{e.active ? "Active" : "Inactive"}</Pill></TableCell>
                <TableCell><Button variant="ghost" size="icon-sm" aria-label={`Edit ${e.name}`} onClick={() => setEdit(e)} disabled={!manage}><Pencil /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {edit && <EmployeeDialog employee={edit === "new" ? undefined : edit} onClose={() => setEdit(null)} onSave={(e) => { actions.saveEmployee(e); toast.success("Employee saved"); setEdit(null); }} />}
    </SectionCard>
  );
}

function EmployeeDialog({ employee, onClose, onSave }: { employee?: Employee; onClose: () => void; onSave: (e: Employee) => void }) {
  const { data, currentUser } = useStore();
  const [name, setName] = useState(employee?.name ?? "");
  const [email, setEmail] = useState(employee?.email ?? "");
  const [role, setRole] = useState<Role>(employee?.role ?? "sales_rep");
  const [title, setTitle] = useState(employee?.title ?? "");
  const [country, setCountry] = useState<Country>(employee?.country ?? "US");
  const [active, setActive] = useState(employee?.active ?? true);
  const isSelf = employee?.id === currentUser.id;
  const save = () => {
    if (name.trim().length < 2) return void toast.error("Enter a name.");
    if (!/^\S+@\S+\.\S+$/.test(email)) return void toast.error("Enter a valid email.");
    if (data.employees.some((e) => e.id !== employee?.id && e.email.toLowerCase() === email.toLowerCase())) return void toast.error("That email is already in use.");
    onSave({ id: employee?.id ?? uid("emp"), name: name.trim(), email: email.trim(), role, title, country, active: isSelf ? true : active });
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{employee ? "Edit employee" : "Add employee"}</DialogTitle>
          <DialogDescription>Roles only change what the UI shows in this demo; they are not real access control.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Name" required>{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
          <Field label="Email" required>{(id) => <Input id={id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
          <Field label="Title">{(id) => <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} />}</Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Role">
              {(id) => (
                <Select value={role} onValueChange={(v) => setRole(v as Role)} disabled={isSelf}>
                  <SelectTrigger id={id} className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{(Object.keys(ROLE_LABEL) as Role[]).map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}</SelectContent>
                </Select>
              )}
            </Field>
            <Field label="Country">
              {(id) => (
                <Select value={country} onValueChange={(v) => setCountry(v as Country)}>
                  <SelectTrigger id={id} className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="US">United States</SelectItem><SelectItem value="CA">Canada</SelectItem></SelectContent>
                </Select>
              )}
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={active} disabled={isSelf} onCheckedChange={(v) => setActive(v === true)} /> Active {isSelf && <span className="text-xs text-muted-foreground">(you can&apos;t deactivate yourself)</span>}</label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* --------------------------- financing defaults ---------------------- */

function FinancingDefaults({ manage }: { manage: boolean }) {
  const { data, actions } = useStore();
  const fd = data.settings.financingDefaults;
  const [f, setF] = useState<Record<keyof typeof fd, string>>(() => Object.fromEntries(Object.entries(fd).map(([k, v]) => [k, String(v)])) as Record<keyof typeof fd, string>);
  const fields: { key: keyof typeof fd; label: string; hint?: string }[] = [
    { key: "loanApr", label: "Default loan APR (%)", hint: "Used for application estimates and calculator prefill." },
    { key: "loanTermMonths", label: "Default loan term (months)" },
    { key: "leaseMoneyFactor", label: "Default lease money factor", hint: "e.g. 0.00250 — informational APR ≈ MF × 2400." },
    { key: "leaseResidualPercent", label: "Default lease residual (%)" },
    { key: "leaseTermMonths", label: "Default lease term (months)" },
    { key: "docFee", label: "Documentation fee", hint: "Prefilled in the calculator; never applied silently." },
    { key: "taxRatePercent", label: "Reference tax rate (%)", hint: "Reference only — the calculator applies tax only if you enter a rate." },
    { key: "offerValidityDays", label: "Offer validity (days)" },
    { key: "followUpDays", label: "Default follow-up (days)" },
  ];
  const save = () => {
    const parsed = Object.fromEntries(fields.map(({ key }) => [key, Number(f[key])])) as typeof fd;
    const bad = fields.find(({ key }) => !(parsed[key] >= 0) || Number.isNaN(parsed[key]));
    if (bad) return void toast.error(`${bad.label} must be a number ≥ 0.`);
    if (parsed.loanApr > 60) return void toast.error("APR must be 60% or less.");
    if (parsed.leaseResidualPercent > 90) return void toast.error("Residual must be 90% or less.");
    if (parsed.loanTermMonths < 1 || parsed.leaseTermMonths < 1) return void toast.error("Terms must be at least 1 month.");
    actions.updateSettings((s) => ({ ...s, financingDefaults: parsed }));
    toast.success("Financing defaults saved");
  };
  return (
    <SectionCard title="Financing defaults" description="Starting values for estimates, the calculator and new offers.">
      <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
        {fields.map(({ key, label, hint }) => (
          <Field key={key} label={label} hint={hint}>{(id) => <Input id={id} inputMode="decimal" value={f[key]} onChange={(e) => setF((x) => ({ ...x, [key]: e.target.value }))} disabled={!manage} />}</Field>
        ))}
      </div>
      <Button className="mt-4" onClick={save} disabled={!manage}>Save defaults</Button>
    </SectionCard>
  );
}

/* ----------------------------- commissions --------------------------- */

function CommissionRules({ manage }: { manage: boolean }) {
  const { data, actions } = useStore();
  const rules = data.settings.commissionRules;
  const [def, setDef] = useState(String(rules.defaultPercent));
  const [ov, setOv] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(rules.overrides).map(([k, v]) => [k, String(v)])));
  const reps = data.employees.filter((e) => e.role === "sales_rep" || e.id in rules.overrides);
  const save = () => {
    const d = Number(def);
    if (!(d >= 0 && d <= 10)) return void toast.error("Default percent must be between 0 and 10.");
    const overrides: Record<string, number> = {};
    for (const [id, v] of Object.entries(ov)) {
      if (v.trim() === "") continue;
      const n = Number(v);
      if (!(n >= 0 && n <= 10)) return void toast.error("Overrides must be between 0 and 10.");
      overrides[id] = n;
    }
    actions.updateSettings((s) => ({ ...s, commissionRules: { defaultPercent: d, overrides } }));
    toast.success("Commission rules saved", { description: "Applies to commissions created from now on; existing lines keep their rates." });
  };
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <SectionCard title="Salesperson commission" description="Percent of funded amount. Not derived from interest.">
        <Field label="Default rate (%)">{(id) => <Input id={id} inputMode="decimal" value={def} onChange={(e) => setDef(e.target.value)} disabled={!manage} className="max-w-40" />}</Field>
        <p className="mb-2 mt-4 text-xs font-medium">Per-employee overrides</p>
        <ul className="space-y-2">
          {reps.map((e) => (
            <li key={e.id} className="flex items-center gap-3">
              <span className="w-40 text-sm">{e.name}</span>
              <Input aria-label={`${e.name} override`} inputMode="decimal" placeholder={`default (${def}%)`} value={ov[e.id] ?? ""} onChange={(x) => setOv((o) => ({ ...o, [e.id]: x.target.value }))} disabled={!manage} className="max-w-40" />
            </li>
          ))}
        </ul>
        <Button className="mt-4" onClick={save} disabled={!manage}>Save rules</Button>
      </SectionCard>
      <SectionCard title="Lender dealer & financing fees" description="Configured per lender (Lenders → Settings).">
        <dl className="-my-1.5">
          {data.lenders.map((l) => (
            <DataRow key={l.id} label={l.name}>{l.commission.dealerFeePercent}% + ${l.commission.financingFeeFlat} flat</DataRow>
          ))}
        </dl>
      </SectionCard>
    </div>
  );
}

/* ------------------------------ templates ---------------------------- */

function Templates({ manage }: { manage: boolean }) {
  const { data, actions } = useStore();
  const [edit, setEdit] = useState<EmailTemplate | "new" | null>(null);
  return (
    <SectionCard
      title="Email templates"
      description="Merged with application details when composing. Sending is simulated."
      action={<Button size="sm" onClick={() => setEdit("new")} disabled={!manage}><Plus /> New template</Button>}
    >
      <ul className="divide-y">
        {data.settings.templates.map((t) => (
          <li key={t.id} className="flex items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{t.name}</p>
              <p className="truncate text-xs text-muted-foreground"><span className="capitalize">{t.audience}</span> · {t.subject}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setEdit(t)} disabled={!manage}><Pencil /> Edit</Button>
            <Button variant="ghost" size="sm" className="text-red-600" disabled={!manage} onClick={() => actions.updateSettings((s) => ({ ...s, templates: s.templates.filter((x) => x.id !== t.id) }))}>Delete</Button>
          </li>
        ))}
      </ul>
      {edit && <TemplateDialog template={edit === "new" ? undefined : edit} onClose={() => setEdit(null)} />}
    </SectionCard>
  );
}

function TemplateDialog({ template, onClose }: { template?: EmailTemplate; onClose: () => void }) {
  const { actions } = useStore();
  const [name, setName] = useState(template?.name ?? "");
  const [audience, setAudience] = useState<"customer" | "lender">(template?.audience ?? "customer");
  const [subject, setSubject] = useState(template?.subject ?? "");
  const [body, setBody] = useState(template?.body ?? "");
  const sample = Object.fromEntries(TEMPLATE_VARIABLES.map((v) => [v, `‹${v}›`]));
  const save = () => {
    if (!name.trim() || !subject.trim() || !body.trim()) return void toast.error("Name, subject and body are required.");
    const t: EmailTemplate = { id: template?.id ?? uid("tpl"), name: name.trim(), audience, subject, body };
    actions.updateSettings((s: AppSettings) => ({ ...s, templates: template ? s.templates.map((x) => (x.id === t.id ? t : x)) : [...s.templates, t] }));
    toast.success("Template saved");
    onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{template ? "Edit template" : "New template"}</DialogTitle>
          <DialogDescription>Use {"{{variable}}"} placeholders: {TEMPLATE_VARIABLES.join(", ")}.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" required>{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
          <Field label="Audience">
            {(id) => (
              <Select value={audience} onValueChange={(v) => setAudience(v as "customer" | "lender")}>
                <SelectTrigger id={id} className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="customer">Customer</SelectItem><SelectItem value="lender">Lender</SelectItem></SelectContent>
              </Select>
            )}
          </Field>
          <Field label="Subject" required className="sm:col-span-2">{(id) => <Input id={id} value={subject} onChange={(e) => setSubject(e.target.value)} />}</Field>
          <Field label="Body" required className="sm:col-span-2">{(id) => <Textarea id={id} rows={9} value={body} onChange={(e) => setBody(e.target.value)} className="font-mono text-[13px]" />}</Field>
        </div>
        <details className="rounded-lg border p-3 text-sm"><summary className="cursor-pointer font-medium">Preview with placeholders</summary><p className="mt-2 font-medium">{renderTemplate(subject, sample)}</p><pre className="mt-1 whitespace-pre-wrap font-sans text-xs text-muted-foreground">{renderTemplate(body, sample)}</pre></details>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>Save template</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ----------------------------- integrations -------------------------- */

function Integrations() {
  const { data } = useStore();
  const app = data.applications.find((a) => a.status === "funded") ?? data.applications[0];
  const items = [
    { name: "Supabase (database, auth, storage)", status: "Planned", body: "Replace the localStorage store with Supabase tables behind the `actions` boundary in `src/store/store.tsx`; use Supabase Auth with row-level security; use Storage for documents via `DocumentService`." },
    { name: "Robot Trader", status: "Planned", body: "Inbound deal payloads prefill applications; outbound status updates keep Robot Trader in sync. Contracts live in `src/services/robot-trader.ts`." },
    { name: "Partner lender APIs", status: "Planned", body: "Implement `LenderAdapter` (`src/services/lender-adapter.ts`) per lender behind a server route so credentials never reach the browser." },
    { name: "Email provider", status: "Planned", body: "Implement `EmailProvider` (`src/services/email.ts`) via Resend/Postmark/SES from a server route with sender verification." },
  ];
  return (
    <div className="space-y-4">
      <Callout tone="warning" title="Nothing is connected">
        This prototype makes no network calls to Supabase, Robot Trader, banks, lenders or email providers. The cards below describe where those integrations would plug in.
      </Callout>
      <div className="grid gap-4 md:grid-cols-2">
        {items.map((i) => (
          <SectionCard key={i.name} title={i.name} action={<Pill tone="neutral">{i.status}</Pill>}>
            <p className="text-sm text-muted-foreground">{i.body}</p>
          </SectionCard>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Mock inbound payload" description="Robot Trader → Finance (illustrative)">
          <pre className="max-h-72 overflow-auto rounded-md bg-slate-950 p-3 font-mono text-[11px] leading-relaxed text-slate-100">{JSON.stringify(MOCK_DEAL_PAYLOAD, null, 2)}</pre>
        </SectionCard>
        <SectionCard title="Mock outbound payload" description={app ? `Finance → Robot Trader for ${app.id} (illustrative)` : undefined}>
          <pre className="max-h-72 overflow-auto rounded-md bg-slate-950 p-3 font-mono text-[11px] leading-relaxed text-slate-100">{JSON.stringify(app ? statusUpdateFor(app) : null, null, 2)}</pre>
        </SectionCard>
      </div>
    </div>
  );
}

/* --------------------------------- demo ------------------------------ */

function Demo() {
  const { data, actions, can, currentUser } = useStore();
  const [confirm, setConfirm] = useState(false);
  const perms = Object.keys(PERMISSION_LABEL) as Permission[];
  return (
    <div className="space-y-4">
      <SectionCard title="Demo role" description="Switch roles to see how the UI would adapt. This is a UI simulation — there is no authentication or server-side authorization.">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span className="text-sm">Acting as</span>
          <Select value={currentUser.id} onValueChange={(v) => { actions.setCurrentUser(v); toast.success("Role switched (demo)"); }}>
            <SelectTrigger className="w-72" aria-label="Acting as"><SelectValue /></SelectTrigger>
            <SelectContent>
              {data.employees.filter((e) => e.active).map((e) => <SelectItem key={e.id} value={e.id}>{e.name} — {ROLE_LABEL[e.role]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="overflow-x-auto">
          <Table className="text-[13px]">
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40"><TableHead className="text-xs">Capability</TableHead>{(Object.keys(ROLE_LABEL) as Role[]).map((r) => <TableHead key={r} className="text-center text-xs">{ROLE_LABEL[r]}</TableHead>)}</TableRow>
            </TableHeader>
            <TableBody>
              {perms.map((p) => (
                <TableRow key={p}>
                  <TableCell>{PERMISSION_LABEL[p]}</TableCell>
                  {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <TableCell key={r} className="text-center">{ROLE_PERMISSIONS[r].includes(p) ? "✓" : <span className="text-muted-foreground/50">—</span>}</TableCell>)}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </SectionCard>

      <SectionCard title="Reset demo data" description="Restores the original seeded dataset and clears every change made in this browser.">
        <Button variant="destructive" onClick={() => setConfirm(true)} disabled={!can("demo.reset")}><RotateCcw /> Reset demo data</Button>
        {!can("demo.reset") && <p className="mt-2 text-xs text-muted-foreground">Only the Administrator role can reset.</p>}
      </SectionCard>

      <SectionCard title="Demo vs production">
        <div className="mb-3 flex items-start gap-2 text-sm"><ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-600" /><p>This prototype is not production-ready and must not hold real customer data.</p></div>
        <ul className="grid gap-x-8 gap-y-1.5 text-sm text-muted-foreground md:grid-cols-2">
          <li>• Fictional customers and lenders only; illustrative robot prices.</li>
          <li>• Data lives in this browser&apos;s localStorage — no server, no backups.</li>
          <li>• No SSN/SIN, bank credentials, account numbers or credit reports are collected.</li>
          <li>• Lender screening is mock rule-based logic, not a credit decision.</li>
          <li>• Submissions and emails are simulated; nothing is transmitted.</li>
          <li>• Documents are metadata only; no files are stored.</li>
          <li>• Production needs real authentication, server-side authorization (RLS), audit logging, encryption, retention, privacy and lending-compliance review.</li>
          <li>• Roles here hide controls only; they do not protect data.</li>
        </ul>
      </SectionCard>
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Reset all demo data?" description="Every application, offer, note and setting returns to its original seeded state. This can't be undone." confirmLabel="Reset" destructive onConfirm={() => { actions.resetDemo(); toast.success("Demo data reset"); }} />
    </div>
  );
}
