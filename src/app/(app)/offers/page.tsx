"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BadgePercent, Columns3, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { OfferDialog } from "@/components/applications/offer-dialog";
import { ExpiryPill, OfferActionsMenu, OfferCompare } from "@/components/offers/offer-parts";
import { OfferBadge } from "@/components/shared/badges";
import { EmptyState, FilterSelect, KpiCard, LenderAvatar, PageHeader, SectionCard } from "@/components/shared/page";
import { Pagination } from "@/components/shared/pagination";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FINANCING_TYPE_LABEL } from "@/domain/labels";
import { OFFER_STATUS_META } from "@/domain/status";
import type { OfferStatus } from "@/domain/types";
import { formatDate, formatMoney } from "@/lib/format";
import { toUsd } from "@/lib/metrics";
import { customerDisplayName, offerDaysLeft } from "@/lib/selectors";
import { useStore } from "@/store/store";

const PAGE = 12;

export default function OffersPage() {
  const { data, can } = useStore();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [product, setProduct] = useState("all");
  const [lender, setLender] = useState("all");
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);
  const [adding, setAdding] = useState(false);

  const apps = useMemo(() => new Map(data.applications.map((a) => [a.id, a])), [data.applications]);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return data.offers
      .filter((o) => apps.get(o.applicationId) && !apps.get(o.applicationId)!.archived)
      .filter((o) => (status === "all" || o.status === status) && (product === "all" || o.product === product) && (lender === "all" || o.lenderId === lender))
      .filter((o) => {
        if (!needle) return true;
        const a = apps.get(o.applicationId)!;
        return o.applicationId.toLowerCase().includes(needle) || customerDisplayName(data.customers.find((c) => c.id === a.customerId)).toLowerCase().includes(needle);
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [data.offers, data.customers, apps, q, status, product, lender]);

  const pageRows = rows.slice((page - 1) * PAGE, page * PAGE);
  const active = data.offers.filter((o) => o.status === "active");
  const expiring = active.filter((o) => offerDaysLeft(o) <= 7 && offerDaysLeft(o) >= 0);
  const acceptedUsd = data.offers.filter((o) => o.status === "accepted").reduce((s, o) => s + toUsd(o.approvedAmount, apps.get(o.applicationId)?.currency ?? "USD"), 0);
  const selected = data.offers.filter((o) => sel.includes(o.id));

  const toggle = (id: string) => {
    setComparing(false);
    setSel((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (cur.length >= 3) {
        toast.info("You can compare up to 3 offers at a time.");
        return cur;
      }
      return [...cur, id];
    });
  };

  return (
    <>
      <PageHeader
        title="Financing offers"
        description="Every lender offer in one place. Compare up to three; the platform highlights facts but never picks a winner."
        actions={
          <Button onClick={() => setAdding(true)} disabled={!can("offer.manage")}>
            <Plus /> Add offer
          </Button>
        }
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <KpiCard label="Active offers" value={active.length} sub="awaiting a customer decision" />
        <KpiCard label="Expiring within 7 days" value={expiring.length} sub={expiring.length ? "follow up with customers" : "nothing urgent"} />
        <KpiCard label="Accepted (USD eq.)" value={formatMoney(acceptedUsd, "USD", { compact: true })} sub={`${data.offers.filter((o) => o.status === "accepted").length} offers accepted`} />
      </div>

      {comparing && selected.length >= 2 && (
        <SectionCard title="Comparison" className="mb-4">
          <OfferCompare offers={selected} onClose={() => setComparing(false)} />
        </SectionCard>
      )}

      <SectionCard flush>
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <div className="relative min-w-52 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search application or customer…" aria-label="Search offers" className="pl-8" />
          </div>
          <FilterSelect label="Status" value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={(Object.keys(OFFER_STATUS_META) as OfferStatus[]).map((s) => ({ value: s, label: OFFER_STATUS_META[s].label }))} />
          <FilterSelect label="Product" value={product} onChange={(v) => { setProduct(v); setPage(1); }} options={Object.entries(FINANCING_TYPE_LABEL).map(([value, label]) => ({ value, label }))} />
          <FilterSelect label="Lender" value={lender} onChange={(v) => { setLender(v); setPage(1); }} options={data.lenders.map((l) => ({ value: l.id, label: l.name }))} />
          <Button variant="outline" disabled={selected.length < 2} onClick={() => setComparing(true)}>
            <Columns3 /> Compare{selected.length ? ` (${selected.length})` : ""}
          </Button>
        </div>
        {rows.length === 0 ? (
          <EmptyState icon={BadgePercent} title="No offers match" description="Offers are created after a lender approves an application." />
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[1000px] text-[13px]">
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="w-10" />
                  <TableHead className="text-xs">Application</TableHead>
                  <TableHead className="text-xs">Lender</TableHead>
                  <TableHead className="text-xs">Product</TableHead>
                  <TableHead className="text-right text-xs">Amount</TableHead>
                  <TableHead className="text-right text-xs">Payment</TableHead>
                  <TableHead className="text-xs">Term</TableHead>
                  <TableHead className="text-right text-xs">Total cost</TableHead>
                  <TableHead className="text-xs">Expires</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.map((o) => {
                  const a = apps.get(o.applicationId)!;
                  const l = data.lenders.find((x) => x.id === o.lenderId);
                  return (
                    <TableRow key={o.id} data-state={sel.includes(o.id) ? "selected" : undefined}>
                      <TableCell>
                        <Checkbox checked={sel.includes(o.id)} onCheckedChange={() => toggle(o.id)} aria-label={`Select ${l?.name} offer on ${o.applicationId}`} />
                      </TableCell>
                      <TableCell>
                        <Link href={`/applications/${a.id}?tab=offers`} className="font-mono text-xs text-primary hover:underline">
                          {a.id}
                        </Link>
                        <p className="text-xs text-muted-foreground">{customerDisplayName(data.customers.find((c) => c.id === a.customerId))}</p>
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-2">
                          {l && <LenderAvatar lender={l} size="sm" />}
                          {l?.name}
                        </span>
                      </TableCell>
                      <TableCell>{FINANCING_TYPE_LABEL[o.product]}</TableCell>
                      <TableCell className="tnum text-right">{formatMoney(o.approvedAmount, a.currency)}</TableCell>
                      <TableCell className="tnum text-right font-medium">{formatMoney(o.monthlyPayment, a.currency, { decimals: true })}</TableCell>
                      <TableCell>{o.termMonths} mo</TableCell>
                      <TableCell className="tnum text-right">{formatMoney(o.totalCost, a.currency)}</TableCell>
                      <TableCell>
                        <span className="text-muted-foreground">{formatDate(o.expiresAt)}</span> <ExpiryPill offer={o} />
                      </TableCell>
                      <TableCell>
                        <OfferBadge status={o.status} />
                      </TableCell>
                      <TableCell>
                        <OfferActionsMenu offer={o} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
        <Pagination page={page} pageSize={PAGE} total={rows.length} onPage={setPage} />
      </SectionCard>
      {adding && <OfferDialog open onOpenChange={setAdding} />}
    </>
  );
}
