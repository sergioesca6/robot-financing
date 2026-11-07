"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Plus, Search, Users } from "lucide-react";
import { CustomerDialog } from "@/components/customers/customer-dialog";
import { FilterSelect, EmptyState, PageHeader, PersonAvatar, SectionCard } from "@/components/shared/page";
import { Pagination } from "@/components/shared/pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CUSTOMER_TYPE_LABEL } from "@/domain/labels";
import { formatMoney, formatRelative } from "@/lib/format";
import { toUsd } from "@/lib/metrics";
import { customerDisplayName } from "@/lib/selectors";
import { useStore } from "@/store/store";

const PAGE = 12;

export default function CustomersPage() {
  const { data, can } = useStore();
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [country, setCountry] = useState("all");
  const [owner, setOwner] = useState("all");
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return data.customers
      .map((c) => {
        const apps = data.applications.filter((a) => a.customerId === c.id && !a.archived);
        const funded = apps.filter((a) => a.status === "funded");
        const last = apps.reduce((m, a) => (a.lastActivityAt > m ? a.lastActivityAt : m), c.createdAt);
        return { c, apps, funded, volume: funded.reduce((s, a) => s + toUsd(a.fundedAmount ?? a.requestedAmount, a.currency), 0), last };
      })
      .filter(({ c }) => (type === "all" || c.type === type) && (country === "all" || c.country === country) && (owner === "all" || c.assignedEmployeeId === owner))
      .filter(({ c }) => !needle || [c.name, c.companyName, c.email, c.id, c.industry].some((v) => v?.toLowerCase().includes(needle)))
      .sort((a, b) => b.last.localeCompare(a.last));
  }, [data.customers, data.applications, q, type, country, owner]);

  const pageRows = rows.slice((page - 1) * PAGE, page * PAGE);

  return (
    <>
      <PageHeader
        title="Customers"
        description="One record per customer — applications link back here, so repeat buyers never create duplicates."
        actions={
          <Button onClick={() => setAdding(true)} disabled={!can("application.create")}>
            <Plus /> New customer
          </Button>
        }
      />
      <SectionCard flush>
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="Search name, company, email, industry…"
              aria-label="Search customers"
              className="pl-8"
            />
          </div>
          <FilterSelect label="Type" value={type} onChange={(v) => { setType(v); setPage(1); }} options={Object.entries(CUSTOMER_TYPE_LABEL).map(([value, label]) => ({ value, label }))} />
          <FilterSelect label="Country" value={country} onChange={(v) => { setCountry(v); setPage(1); }} options={[{ value: "US", label: "United States" }, { value: "CA", label: "Canada" }]} />
          <FilterSelect label="Owner" value={owner} onChange={(v) => { setOwner(v); setPage(1); }} options={data.employees.map((e) => ({ value: e.id, label: e.name }))} />
        </div>
        {rows.length === 0 ? (
          <EmptyState icon={Users} title="No customers match" description="Try clearing a filter or searching by a different term." />
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[900px] text-[13px]">
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="text-xs">Customer</TableHead>
                  <TableHead className="text-xs">Type</TableHead>
                  <TableHead className="text-xs">Location</TableHead>
                  <TableHead className="text-xs">Owner</TableHead>
                  <TableHead className="text-right text-xs">Applications</TableHead>
                  <TableHead className="text-right text-xs">Funded (USD eq.)</TableHead>
                  <TableHead className="text-xs">Last activity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.map(({ c, apps, funded, volume, last }) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link href={`/customers/${c.id}`} className="font-medium text-foreground hover:underline">
                        {customerDisplayName(c)}
                      </Link>
                      <p className="text-xs text-muted-foreground">{c.email}</p>
                    </TableCell>
                    <TableCell>{CUSTOMER_TYPE_LABEL[c.type]}</TableCell>
                    <TableCell>
                      {c.region}, {c.country}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5">
                        <PersonAvatar name={data.employees.find((e) => e.id === c.assignedEmployeeId)?.name ?? "?"} />
                        {data.employees.find((e) => e.id === c.assignedEmployeeId)?.name.split(" ")[0]}
                      </span>
                    </TableCell>
                    <TableCell className="tnum text-right">
                      {apps.length}
                      {funded.length > 0 && <span className="text-muted-foreground"> ({funded.length} funded)</span>}
                    </TableCell>
                    <TableCell className="tnum text-right">{volume ? formatMoney(volume, "USD", { compact: true }) : "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{formatRelative(last)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <Pagination page={page} pageSize={PAGE} total={rows.length} onPage={setPage} />
      </SectionCard>
      {adding && <CustomerDialog open onOpenChange={setAdding} />}
    </>
  );
}
