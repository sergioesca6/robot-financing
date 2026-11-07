"use client";

import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { APPLICATION_STATUS_META, STATUS_TRANSITIONS } from "@/domain/status";
import type { ApplicationStatus, FinancingApplication } from "@/domain/types";
import { validateStatusChange } from "@/lib/workflow";
import { useStore } from "@/store/store";
import { Pill } from "@/components/shared/badges";
import { toast } from "sonner";

/** Statuses that must be reached through a dedicated workflow, not a bare status change. */
const GUIDED: Partial<Record<ApplicationStatus, string>> = {
  submitted: "Use “Submit to Lenders”",
  offer_accepted: "Accept an offer on the Offers tab",
};

export function StatusMenu({
  app,
  trigger,
  onSpecial,
}: {
  app: FinancingApplication;
  trigger?: React.ReactNode;
  onSpecial?: (to: ApplicationStatus) => void;
}) {
  const { data, actions, can } = useStore();
  const options = STATUS_TRANSITIONS[app.status];
  const disabled = !can("application.status");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        {trigger ?? (
          <Button variant="outline" size="sm" disabled={disabled}>
            Change status <ChevronDown />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Move from {APPLICATION_STATUS_META[app.status].label} to…</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.map((to) => {
          const guided = GUIDED[to];
          const err = guided ?? validateStatusChange(data, app, to);
          return (
            <DropdownMenuItem
              key={to}
              disabled={!!err && !guided}
              onSelect={() => {
                if (guided) {
                  onSpecial?.(to);
                  if (!onSpecial) toast.info(guided);
                  return;
                }
                const res = actions.changeStatus(app.id, to);
                if (res.ok) toast.success(`Moved to ${APPLICATION_STATUS_META[to].label}`);
              }}
              className="flex-col items-start gap-0.5"
            >
              <span className="flex w-full items-center justify-between">
                <Pill tone={APPLICATION_STATUS_META[to].tone}>{APPLICATION_STATUS_META[to].label}</Pill>
              </span>
              {err && <span className="whitespace-normal text-[11px] leading-snug text-muted-foreground">{err}</span>}
            </DropdownMenuItem>
          );
        })}
        {options.length === 0 && <div className="px-2 py-3 text-xs text-muted-foreground">No further transitions.</div>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
