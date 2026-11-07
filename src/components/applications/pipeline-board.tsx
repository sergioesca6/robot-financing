"use client";

import Link from "next/link";
import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { PersonAvatar } from "@/components/shared/page";
import { TONE_DOT, APPLICATION_STATUS_META, APPLICATION_STATUS_ORDER, canTransition } from "@/domain/status";
import type { ApplicationStatus, FinancingApplication } from "@/domain/types";
import { formatMoney, formatRelative } from "@/lib/format";
import { customerDisplayName, robotLabel } from "@/lib/selectors";
import { cn } from "@/lib/utils";
import { useStore } from "@/store/store";
import { StatusMenu } from "./status-menu";
import { Button } from "@/components/ui/button";

const GUIDED_TARGETS: ApplicationStatus[] = ["submitted", "offer_accepted"];

export function PipelineBoard({ apps }: { apps: FinancingApplication[] }) {
  const { data, actions, can } = useStore();
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<ApplicationStatus | null>(null);
  const customers = new Map(data.customers.map((c) => [c.id, c]));
  const employees = new Map(data.employees.map((e) => [e.id, e]));
  const dragging = dragId ? apps.find((a) => a.id === dragId) : undefined;

  const drop = (to: ApplicationStatus) => {
    const app = dragging;
    setDragId(null);
    setOver(null);
    if (!app || app.status === to) return;
    if (!can("application.status")) return void toast.error("Your demo role can't change application status.");
    if (!canTransition(app.status, to)) return void toast.error(`Cannot move from ${APPLICATION_STATUS_META[app.status].label} to ${APPLICATION_STATUS_META[to].label}.`);
    if (GUIDED_TARGETS.includes(to)) {
      return void toast.info(to === "submitted" ? "Open the application and use “Submit to Lenders”." : "Accept an offer from the application's Offers tab.");
    }
    const res = actions.changeStatus(app.id, to);
    if (res.ok) toast.success(`${app.id} moved to ${APPLICATION_STATUS_META[to].label}`);
  };

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-3 sm:-mx-6 sm:px-6">
      <div className="flex min-w-max gap-3">
        {APPLICATION_STATUS_ORDER.map((status) => {
          const meta = APPLICATION_STATUS_META[status];
          const items = apps.filter((a) => a.status === status);
          const valid = dragging ? status === dragging.status || canTransition(dragging.status, status) : true;
          const total = items.reduce((s, a) => s + (a.currency === "USD" ? a.requestedAmount : a.requestedAmount / 1.36), 0);
          return (
            <section
              key={status}
              aria-label={`${meta.label} column`}
              onDragOver={(e) => {
                if (dragging && valid) {
                  e.preventDefault();
                  setOver(status);
                }
              }}
              onDragLeave={() => setOver((o) => (o === status ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                drop(status);
              }}
              className={cn(
                "flex w-[272px] shrink-0 flex-col rounded-xl border bg-muted/40 transition-colors",
                dragging && !valid && "opacity-40",
                over === status && valid && "border-primary/50 bg-primary/5",
              )}
            >
              <header className="flex items-center justify-between gap-2 px-3 pb-2 pt-3">
                <div className="flex items-center gap-2">
                  <span className={cn("size-2 rounded-full", TONE_DOT[meta.tone])} aria-hidden />
                  <h3 className="text-[13px] font-semibold">{meta.label}</h3>
                  <span className="rounded-full bg-card px-1.5 text-[11px] font-medium text-muted-foreground ring-1 ring-border">{items.length}</span>
                </div>
                {items.length > 0 && <span className="tnum text-[11px] text-muted-foreground">{formatMoney(total, "USD", { compact: true })}</span>}
              </header>
              <ul className="flex min-h-24 flex-1 flex-col gap-2 px-2 pb-2">
                {items.map((a) => (
                  <li
                    key={a.id}
                    draggable={can("application.status")}
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", a.id);
                      setDragId(a.id);
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setOver(null);
                    }}
                    className={cn(
                      "group rounded-lg border bg-card p-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-shadow hover:shadow-md",
                      can("application.status") && "cursor-grab active:cursor-grabbing",
                      dragId === a.id && "opacity-50",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/applications/${a.id}`} className="min-w-0 flex-1" draggable={false}>
                        <p className="font-mono text-[11px] text-muted-foreground">{a.id}</p>
                        <p className="truncate text-[13px] font-medium leading-snug">{customerDisplayName(customers.get(a.customerId))}</p>
                      </Link>
                      <StatusMenu
                        app={a}
                        trigger={
                          <Button variant="ghost" size="icon-xs" aria-label={`Move ${a.id}`} className="-mr-1 -mt-0.5 opacity-60 hover:opacity-100">
                            <MoreHorizontal />
                          </Button>
                        }
                      />
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{robotLabel(a)}</p>
                    <div className="mt-2.5 flex items-center justify-between">
                      <span className="tnum text-[13px] font-semibold">{formatMoney(a.requestedAmount, a.currency, { compact: true })}</span>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                        {a.financingType} · {a.currency}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <PersonAvatar name={employees.get(a.assignedEmployeeId)?.name ?? "?"} className="size-5 text-[9px]" />
                        {employees.get(a.assignedEmployeeId)?.name.split(" ")[0]}
                      </span>
                      <span>{formatRelative(a.lastActivityAt)}</span>
                    </div>
                  </li>
                ))}
                {items.length === 0 && (
                  <li className="flex flex-1 items-center justify-center rounded-lg border border-dashed py-6 text-xs text-muted-foreground">
                    {dragging && valid ? "Drop here" : "No applications"}
                  </li>
                )}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
