"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { FilePlus2, Mail, Pencil, StickyNote, UserX } from "lucide-react";
import { CustomerDialog } from "@/components/customers/customer-dialog";
import { AppStatusBadge } from "@/components/shared/badges";
import { DataRow, EmptyState, PageHeader, SectionCard } from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CUSTOMER_TYPE_LABEL, FINANCING_TYPE_LABEL } from "@/domain/labels";
import { formatDate, formatMoney, formatRelative } from "@/lib/format";
import { robotLabel } from "@/lib/selectors";
import { customerDisplayName } from "@/lib/selectors";
import { useStore } from "@/store/store";

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, actions, can } = useStore();
  const customer = data.customers.find((c) => c.id === id);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState("");

  if (!customer) {
    return (
      <div className="rounded-xl border bg-card">
        <EmptyState icon={UserX} title="Customer not found" action={<Button asChild><Link href="/customers">Back to customers</Link></Button>} />
      </div>
    );
  }
  const apps = data.applications.filter((a) => a.customerId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const emails = data.emails.filter((e) => apps.some((a) => a.id === e.applicationId));
  const owner = data.employees.find((e) => e.id === customer.assignedEmployeeId);

  return (
    <>
      <PageHeader
        eyebrow={customer.id}
        title={customerDisplayName(customer)}
        description={`${CUSTOMER_TYPE_LABEL[customer.type]} · ${customer.region}, ${customer.country} · customer since ${formatDate(customer.createdAt)}`}
        actions={
          <>
            <Button variant="outline" onClick={() => setEditing(true)} disabled={!can("application.edit")}>
              <Pencil /> Edit
            </Button>
            <Button asChild disabled={!can("application.create")}>
              <Link href={`/applications/new?customer=${customer.id}`}>
                <FilePlus2 /> New application
              </Link>
            </Button>
          </>
        }
      />
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <SectionCard title={`Applications (${apps.length})`} flush>
            {apps.length === 0 ? (
              <EmptyState icon={FilePlus2} title="No applications yet" description="Start one with the customer's details already filled in." />
            ) : (
              <ul className="divide-y">
                {apps.map((a) => (
                  <li key={a.id}>
                    <Link href={`/applications/${a.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-muted/40">
                      <span className="w-20 font-mono text-xs text-muted-foreground">{a.id}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{robotLabel(a)}</span>
                        <span className="text-xs text-muted-foreground">
                          {FINANCING_TYPE_LABEL[a.financingType]} · {formatMoney(a.requestedAmount, a.currency)} · {formatRelative(a.lastActivityAt)}
                        </span>
                      </span>
                      <AppStatusBadge status={a.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
          <SectionCard title="Emails" flush>
            {emails.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No emails recorded (all emails in this demo are simulated).</p>
            ) : (
              <ul className="divide-y">
                {emails.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <Mail className="size-4 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{e.subject}</span>
                    <span className="text-xs text-muted-foreground">{e.status === "draft" ? "Draft" : "Simulated"} · {formatRelative(e.sentAt ?? e.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
        <aside className="space-y-4">
          <SectionCard title="Contact">
            <dl className="-my-1.5">
              <DataRow label="Contact">{customer.name}</DataRow>
              <DataRow label="Email">
                <a className="text-primary hover:underline" href={`mailto:${customer.email}`}>
                  {customer.email}
                </a>
              </DataRow>
              <DataRow label="Phone">{customer.phone}</DataRow>
              <DataRow label="Address">{customer.address}</DataRow>
              {customer.industry && <DataRow label="Industry">{customer.industry}</DataRow>}
              {customer.yearsInBusiness !== undefined && <DataRow label="Years in business">{customer.yearsInBusiness}</DataRow>}
              <DataRow label="Owner">{owner?.name}</DataRow>
              {customer.robotTraderCustomerId && <DataRow label="Robot Trader ID">{customer.robotTraderCustomerId}</DataRow>}
            </dl>
          </SectionCard>
          <SectionCard title="Notes">
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                const r = actions.addCustomerNote(customer.id, note);
                if (r.ok) setNote("");
              }}
            >
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note…" aria-label="New note" />
              <Button type="submit" size="sm" variant="outline" disabled={!note.trim()}>
                <StickyNote /> Add note
              </Button>
            </form>
            <ul className="mt-3 space-y-3">
              {customer.notes.map((n) => (
                <li key={n.id} className="text-sm">
                  <p>{n.body}</p>
                  <p className="text-xs text-muted-foreground">
                    {data.employees.find((e) => e.id === n.authorId)?.name ?? "System"} · {formatRelative(n.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          </SectionCard>
        </aside>
      </div>
      {editing && <CustomerDialog open onOpenChange={setEditing} customer={customer} />}
    </>
  );
}
