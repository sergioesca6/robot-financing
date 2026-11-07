"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown, Archive, ArchiveRestore, Copy, ExternalLink, MoreHorizontal, Pencil } from "lucide-react";
import { toast } from "sonner";
import { AppStatusBadge } from "@/components/shared/badges";
import { PersonAvatar } from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CUSTOMER_TYPE_LABEL, FINANCING_TYPE_LABEL } from "@/domain/labels";
import type { FinancingApplication } from "@/domain/types";
import { formatDate, formatMoney, formatRelative } from "@/lib/format";
import { customerDisplayName, robotLabel } from "@/lib/selectors";
import { cn } from "@/lib/utils";
import { useStore } from "@/store/store";

export type SortKey =
  | "id"
  | "customer"
  | "robot"
  | "purchaseTotal"
  | "requestedAmount"
  | "financingType"
  | "employee"
  | "status"
  | "submittedAt"
  | "lastActivityAt";

export interface SortState {
  key: SortKey;
  dir: "asc" | "desc";
}

function SortHead({ label, k, sort, onSort, className }: { label: string; k: SortKey; sort: SortState; onSort: (k: SortKey) => void; className?: string }) {
  const active = sort.key === k;
  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead className={className} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button onClick={() => onSort(k)} className={cn("inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium hover:text-foreground", active ? "text-foreground" : "text-muted-foreground")}>
        {label}
        <Icon className={cn("size-3", !active && "opacity-50")} aria-hidden />
      </button>
    </TableHead>
  );
}

export function ApplicationsTable({
  apps,
  sort,
  onSort,
  selected,
  onSelect,
}: {
  apps: FinancingApplication[];
  sort: SortState;
  onSort: (k: SortKey) => void;
  selected: Set<string>;
  onSelect: (ids: Set<string>) => void;
}) {
  const { data, actions, can } = useStore();
  const router = useRouter();
  const customers = new Map(data.customers.map((c) => [c.id, c]));
  const employees = new Map(data.employees.map((e) => [e.id, e]));
  const allSelected = apps.length > 0 && apps.every((a) => selected.has(a.id));
  const someSelected = apps.some((a) => selected.has(a.id));

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelect(next);
  };

  return (
    <div className="overflow-x-auto">
      <Table className="min-w-[1280px] text-[13px]">
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead className="w-10">
              <Checkbox
                checked={allSelected ? true : someSelected ? "indeterminate" : false}
                onCheckedChange={(v) => {
                  const next = new Set(selected);
                  apps.forEach((a) => (v ? next.add(a.id) : next.delete(a.id)));
                  onSelect(next);
                }}
                aria-label="Select all on this page"
              />
            </TableHead>
            <SortHead label="Application" k="id" sort={sort} onSort={onSort} />
            <SortHead label="Applicant" k="customer" sort={sort} onSort={onSort} />
            <TableHead className="text-xs font-medium text-muted-foreground">Type</TableHead>
            <SortHead label="Robot / model" k="robot" sort={sort} onSort={onSort} />
            <SortHead label="Purchase price" k="purchaseTotal" sort={sort} onSort={onSort} className="text-right" />
            <SortHead label="Requested" k="requestedAmount" sort={sort} onSort={onSort} className="text-right" />
            <SortHead label="Financing" k="financingType" sort={sort} onSort={onSort} />
            <SortHead label="Assigned to" k="employee" sort={sort} onSort={onSort} />
            <SortHead label="Status" k="status" sort={sort} onSort={onSort} />
            <SortHead label="Submitted" k="submittedAt" sort={sort} onSort={onSort} />
            <SortHead label="Last activity" k="lastActivityAt" sort={sort} onSort={onSort} />
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {apps.map((a) => {
            const c = customers.get(a.customerId);
            const emp = employees.get(a.assignedEmployeeId);
            return (
              <TableRow
                key={a.id}
                data-state={selected.has(a.id) ? "selected" : undefined}
                className="cursor-pointer"
                onClick={() => router.push(`/applications/${a.id}`)}
              >
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={selected.has(a.id)} onCheckedChange={() => toggle(a.id)} aria-label={`Select ${a.id}`} />
                </TableCell>
                <TableCell>
                  <Link href={`/applications/${a.id}`} className="font-mono text-xs font-medium text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
                    {a.id}
                  </Link>
                  {a.archived && <span className="ml-1.5 rounded bg-muted px-1 text-[10px] text-muted-foreground">Archived</span>}
                </TableCell>
                <TableCell className="max-w-[220px]">
                  <div className="truncate font-medium">{customerDisplayName(c)}</div>
                  {c?.type === "business" && <div className="truncate text-xs text-muted-foreground">{c.name}</div>}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{c ? CUSTOMER_TYPE_LABEL[c.type] : "—"}</TableCell>
                <TableCell className="max-w-[200px] truncate">{robotLabel(a)}</TableCell>
                <TableCell className="tnum text-right">{formatMoney(a.purchaseTotal, a.currency)}</TableCell>
                <TableCell className="tnum text-right font-medium">{formatMoney(a.requestedAmount, a.currency)}</TableCell>
                <TableCell>
                  <span className="text-xs">{FINANCING_TYPE_LABEL[a.financingType]}</span>
                  <span className="ml-1 text-[10px] text-muted-foreground">{a.currency}</span>
                </TableCell>
                <TableCell>
                  <span className="flex items-center gap-1.5">
                    <PersonAvatar name={emp?.name ?? "?"} />
                    <span className="hidden whitespace-nowrap xl:inline">{emp?.name}</span>
                  </span>
                </TableCell>
                <TableCell>
                  <AppStatusBadge status={a.status} />
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(a.submittedAt, a.country)}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{formatRelative(a.lastActivityAt)}</TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${a.id}`}>
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => router.push(`/applications/${a.id}`)}>
                        <ExternalLink /> Open
                      </DropdownMenuItem>
                      <DropdownMenuItem disabled={!can("application.edit")} onSelect={() => router.push(`/applications/${a.id}/edit`)}>
                        <Pencil /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={!can("application.create")}
                        onSelect={() => {
                          const r = actions.duplicateApplication(a.id);
                          if (r.ok) {
                            toast.success(`Duplicated as ${r.value.id}`);
                            router.push(`/applications/${r.value.id}/edit`);
                          }
                        }}
                      >
                        <Copy /> Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        disabled={!can("application.archive")}
                        onSelect={() => {
                          const r = actions.archiveApplication(a.id, !a.archived);
                          if (r.ok) toast.success(a.archived ? `${a.id} restored` : `${a.id} archived`);
                        }}
                      >
                        {a.archived ? <ArchiveRestore /> : <Archive />} {a.archived ? "Restore" : "Archive"}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
