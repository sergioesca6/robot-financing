"use client";

import { useState } from "react";
import { Check, ChevronDown, CircleAlert, X } from "lucide-react";
import { IntegrationBadge, VerdictBadge } from "@/components/shared/badges";
import { Callout, LenderAvatar } from "@/components/shared/page";
import { Checkbox } from "@/components/ui/checkbox";
import { SCREENING_DISCLAIMER, type CheckResult, type LenderMatch } from "@/lib/matching";
import { cn } from "@/lib/utils";

const ICON: Record<CheckResult, { Icon: typeof Check; cls: string }> = {
  pass: { Icon: Check, cls: "text-emerald-600" },
  warn: { Icon: CircleAlert, cls: "text-amber-600" },
  fail: { Icon: X, cls: "text-red-600" },
};

export function LenderMatchList({
  matches,
  selected,
  onToggle,
  hideIneligible,
}: {
  matches: LenderMatch[];
  selected?: Set<string>;
  onToggle?: (lenderId: string) => void;
  hideIneligible?: boolean;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const list = hideIneligible ? matches.filter((m) => m.verdict !== "ineligible") : matches;
  const selectable = !!onToggle;
  return (
    <div className="space-y-2">
      <Callout tone="warning" title="Mock rule-based screening">
        {SCREENING_DISCLAIMER}
      </Callout>
      <ul className="divide-y overflow-hidden rounded-lg border">
        {list.map((m) => {
          const isOpen = open === m.lender.id;
          const disabled = m.verdict === "ineligible" && selectable;
          return (
            <li key={m.lender.id} className={cn(disabled && "bg-muted/30")}>
              <div className="flex items-center gap-3 px-3 py-2.5">
                {selectable && (
                  <Checkbox
                    checked={selected?.has(m.lender.id) ?? false}
                    onCheckedChange={() => onToggle?.(m.lender.id)}
                    aria-label={`Select ${m.lender.name}`}
                    disabled={disabled}
                  />
                )}
                <LenderAvatar lender={m.lender} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className={cn("text-sm font-medium", disabled && "text-muted-foreground")}>{m.lender.name}</span>
                    <VerdictBadge verdict={m.verdict} />
                    <IntegrationBadge method={m.lender.integration} />
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {m.program ? <span className="font-medium text-foreground/70">{m.program.name} · </span> : null}
                    {m.summary}
                  </p>
                </div>
                <span className="hidden text-right text-xs text-muted-foreground sm:block">
                  ~{m.lender.turnaroundDays}d turnaround
                  <br />
                  {m.lender.aprMin}–{m.lender.aprMax}% indicative
                </span>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : m.lender.id)}
                  aria-expanded={isOpen}
                  aria-label={`Why ${m.lender.name} is ${m.verdict}`}
                  className="rounded-md p-1 text-muted-foreground hover:bg-muted"
                >
                  <ChevronDown className={cn("size-4 transition-transform", isOpen && "rotate-180")} />
                </button>
              </div>
              {isOpen && (
                <ul className="space-y-1 border-t bg-muted/30 px-4 py-3">
                  {m.checks.map((c) => {
                    const { Icon, cls } = ICON[c.result];
                    return (
                      <li key={c.key} className="flex items-start gap-2 text-xs">
                        <Icon className={cn("mt-0.5 size-3.5 shrink-0", cls)} aria-label={c.result} />
                        <span>
                          <span className="font-medium">{c.label}:</span> <span className="text-muted-foreground">{c.detail}</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
