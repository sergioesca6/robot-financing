"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Callout, Field } from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CUSTOMER_TYPE_LABEL, INDUSTRIES, regionsFor } from "@/domain/labels";
import type { Country, Customer, CustomerType } from "@/domain/types";
import { uid } from "@/lib/id";
import { useStore } from "@/store/store";

export function CustomerDialog({ open, onOpenChange, customer, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; customer?: Customer; onSaved?: (c: Customer) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <Form customer={customer} onDone={(c) => { if (c) onSaved?.(c); onOpenChange(false); }} />
      </DialogContent>
    </Dialog>
  );
}

function Form({ customer, onDone }: { customer?: Customer; onDone: (c?: Customer) => void }) {
  const { data, actions, currentUser } = useStore();
  const [type, setType] = useState<CustomerType>(customer?.type ?? "business");
  const [name, setName] = useState(customer?.name ?? "");
  const [company, setCompany] = useState(customer?.companyName ?? "");
  const [email, setEmail] = useState(customer?.email ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [country, setCountry] = useState<Country>(customer?.country ?? data.settings.dealership.defaultCountry);
  const [region, setRegion] = useState(customer?.region ?? "");
  const [address, setAddress] = useState(customer?.address ?? "");
  const [industry, setIndustry] = useState(customer?.industry ?? "");
  const [years, setYears] = useState(String(customer?.yearsInBusiness ?? ""));
  const [owner, setOwner] = useState(customer?.assignedEmployeeId ?? currentUser.id);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const dup = data.customers.find((c) => c.id !== customer?.id && c.email.toLowerCase() === email.trim().toLowerCase());

  const save = () => {
    const e: Record<string, string> = {};
    if (name.trim().length < 2) e.name = "Enter a name";
    if (type === "business" && !company.trim()) e.company = "Enter the company name";
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) e.email = "Enter a valid email";
    if (phone.trim().length < 7) e.phone = "Enter a phone number";
    if (!region) e.region = "Select a region";
    if (address.trim().length < 5) e.address = "Enter an address";
    if (type === "business" && !industry) e.industry = "Select an industry";
    setErrors(e);
    if (Object.keys(e).length) return;
    const next: Customer = {
      id: customer?.id ?? uid("cus"),
      type,
      name: name.trim(),
      companyName: type === "business" ? company.trim() : undefined,
      email: email.trim(),
      phone: phone.trim(),
      country,
      region,
      address: address.trim(),
      industry: type === "business" ? industry : undefined,
      yearsInBusiness: type === "business" && years !== "" ? Number(years) : undefined,
      assignedEmployeeId: owner,
      notes: customer?.notes ?? [],
      createdAt: customer?.createdAt ?? new Date().toISOString(),
      robotTraderCustomerId: customer?.robotTraderCustomerId,
    };
    const res = actions.saveCustomer(next);
    if (res.ok) {
      toast.success(customer ? "Customer updated" : "Customer added");
      onDone(res.value);
    }
  };

  const regions = Object.entries(regionsFor(country));
  return (
    <>
      <DialogHeader>
        <DialogTitle>{customer ? `Edit ${customer.companyName ?? customer.name}` : "New customer"}</DialogTitle>
        <DialogDescription>Demo records only — use fictional people and businesses. Do not enter SSNs/SINs or banking details.</DialogDescription>
      </DialogHeader>
      {dup && (
        <Callout tone="warning" title="Duplicate email">
          {dup.companyName ?? dup.name} already uses this email. Customer emails must be unique.
        </Callout>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Customer type" required>
          {(id) => (
            <Select value={type} onValueChange={(v) => setType(v as CustomerType)} disabled={!!customer}>
              <SelectTrigger id={id} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CUSTOMER_TYPE_LABEL).map(([k, l]) => (
                  <SelectItem key={k} value={k}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
        <Field label="Assigned employee" required>
          {(id) => (
            <Select value={owner} onValueChange={setOwner}>
              <SelectTrigger id={id} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {data.employees.filter((e) => e.active).map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
        <Field label={type === "business" ? "Primary contact" : "Full name"} required error={errors.name}>
          {(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.name} />}
        </Field>
        {type === "business" && (
          <Field label="Company name" required error={errors.company}>
            {(id) => <Input id={id} value={company} onChange={(e) => setCompany(e.target.value)} aria-invalid={!!errors.company} />}
          </Field>
        )}
        <Field label="Email" required error={errors.email}>
          {(id) => <Input id={id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!errors.email} />}
        </Field>
        <Field label="Phone" required error={errors.phone}>
          {(id) => <Input id={id} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} aria-invalid={!!errors.phone} />}
        </Field>
        <Field label="Country" required>
          {(id) => (
            <Select
              value={country}
              onValueChange={(v) => {
                setCountry(v as Country);
                setRegion("");
              }}
            >
              <SelectTrigger id={id} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="US">United States</SelectItem>
                <SelectItem value="CA">Canada</SelectItem>
              </SelectContent>
            </Select>
          )}
        </Field>
        <Field label={country === "US" ? "State" : "Province"} required error={errors.region}>
          {(id) => (
            <Select value={region} onValueChange={setRegion}>
              <SelectTrigger id={id} className="w-full" aria-invalid={!!errors.region}>
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                {regions.map(([k, l]) => (
                  <SelectItem key={k} value={k}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
        <Field label="Address" required error={errors.address} className="sm:col-span-2">
          {(id) => <Input id={id} value={address} onChange={(e) => setAddress(e.target.value)} aria-invalid={!!errors.address} />}
        </Field>
        {type === "business" && (
          <>
            <Field label="Industry" required error={errors.industry}>
              {(id) => (
                <Select value={industry} onValueChange={setIndustry}>
                  <SelectTrigger id={id} className="w-full" aria-invalid={!!errors.industry}>
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    {INDUSTRIES.map((i) => (
                      <SelectItem key={i} value={i}>
                        {i}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
            <Field label="Years in business">{(id) => <Input id={id} type="number" min={0} value={years} onChange={(e) => setYears(e.target.value)} />}</Field>
          </>
        )}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => onDone()}>
          Cancel
        </Button>
        <Button onClick={save} disabled={!!dup}>
          {customer ? "Save changes" : "Add customer"}
        </Button>
      </DialogFooter>
    </>
  );
}
