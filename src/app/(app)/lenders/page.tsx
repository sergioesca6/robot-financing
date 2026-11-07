"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Clock, Landmark, Plus, Search } from "lucide-react";
import { LenderDialog } from "@/components/lenders/lender-dialogs";
import { IntegrationBadge, Pill } from "@/components/shared/badges";
import { EmptyState, FilterSelect, LenderAvatar, PageHeader } from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FINANCING_TYPE_LABEL, INTEGRATION_LABEL } from "@/domain/labels";
import { formatMoney } from "@/lib/format";
import { lenderStats } from "@/lib/metrics";
import { useRouter } from "next/navigation";
import { useStore } from "@/store/store";

export default function LendersPage() {
  const { data, can } = useStore();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [integration, setIntegration] = useState("all");
  const [country, setCountry] = useState("all");
  const [product, setProduct] = useState("all");
  const [status, setStatus] = useState("all");
  const [adding, setAdding] = useState(false);

  const stats = useMemo(() => new Map(lenderStats(data, data.applications).map((s) => [s.lenderId, s])), [data]);
  const list = data.lenders
    .filter((l) => !q.trim() || l.name.toLowerCase().includes(q.trim().toLowerCase()))
    .filter((l) => integration === "all" || l.integration === integration)
    .filter((l) => country === "all" || l.countries.includes(country as "US" | "CA"))
    .filter((l) => product === "all" || l.products.includes(product as "loan" | "lease"))
    .filter((l) => status === "all" || (status === "active" ? l.active : !l.active));

  return (
    <>
      <PageHeader
        title="Lenders"
        description="Partner banks and finance companies — fictional in this demo. Each lender's profile drives mock screening."
        actions={
          <Button onClick={() => setAdding(true)} disabled={!can("lender.manage")}>
            <Plus /> Add lender
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search lenders…" aria-label="Search lenders" className="bg-card pl-8" />
        </div>
        <FilterSelect label="Integration" value={integration} onChange={setIntegration} options={Object.entries(INTEGRATION_LABEL).map(([value, label]) => ({ value, label }))} />
        <FilterSelect label="Country" value={country} onChange={setCountry} options={[{ value: "US", label: "United States" }, { value: "CA", label: "Canada" }]} />
        <FilterSelect label="Product" value={product} onChange={setProduct} options={Object.entries(FINANCING_TYPE_LABEL).map(([value, label]) => ({ value, label }))} />
        <FilterSelect label="Status" value={status} onChange={setStatus} options={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} />
      </div>

      {list.length === 0 ? (
        <div className="rounded-xl border bg-card">
          <EmptyState icon={Landmark} title="No lenders match" description="Adjust the filters or add a lender." />
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((l) => {
            const s = stats.get(l.id);
            return (
              <li key={l.id}>
                <Link href={`/lenders/${l.id}`} className="flex h-full flex-col gap-3 rounded-xl border bg-card p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-colors hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <div className="flex items-start gap-3">
                    <LenderAvatar lender={l} size="lg" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{l.name}</p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <IntegrationBadge method={l.integration} />
                        {!l.active && <Pill tone="neutral">Inactive</Pill>}
                      </div>
                    </div>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                    <div>
                      <dt className="text-muted-foreground">Countries</dt>
                      <dd className="font-medium">{l.countries.join(" · ")}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Products</dt>
                      <dd className="font-medium">{l.products.map((p) => FINANCING_TYPE_LABEL[p]).join(" · ")}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Amount range</dt>
                      <dd className="tnum font-medium">
                        {formatMoney(l.minAmount, l.currencies[0]!, { compact: true })} – {formatMoney(l.maxAmount, l.currencies[0]!, { compact: true })}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Indicative rate</dt>
                      <dd className="tnum font-medium">
                        {l.aprMin}–{l.aprMax}%
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-auto flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="size-3" /> ~{l.turnaroundDays}d turnaround
                    </span>
                    <span>
                      {s?.submissions ?? 0} submissions · {s?.approvalRate !== null && s?.approvalRate !== undefined ? `${Math.round(s.approvalRate * 100)}% approved` : "no decisions"}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {adding && <LenderDialog open onOpenChange={setAdding} onSaved={(l) => router.push(`/lenders/${l.id}`)} />}
    </>
  );
}
