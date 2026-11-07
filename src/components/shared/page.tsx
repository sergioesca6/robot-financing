"use client";

import Link from "next/link";
import { useId, type ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Info, TriangleAlert, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Lender } from "@/domain/types";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">{eyebrow}</div>}
        <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-foreground">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SectionCard({
  title,
  description,
  action,
  children,
  className,
  contentClassName,
  flush,
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  flush?: boolean;
}) {
  return (
    <section className={cn("rounded-xl border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)]", className)}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold text-foreground">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
          {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
        </header>
      )}
      <div className={cn(flush ? "" : "p-4", contentClassName)}>{children}</div>
    </section>
  );
}

export function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  trend,
  href,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: LucideIcon;
  trend?: { value: string; positive?: boolean };
  href?: string;
}) {
  const inner = (
    <div className="flex h-full flex-col justify-between gap-2 rounded-xl border bg-card p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-colors hover:border-primary/25">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {Icon && <Icon className="size-4 text-muted-foreground/70" aria-hidden />}
      </div>
      <div className="tnum text-2xl font-semibold tracking-tight text-foreground">{value}</div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {trend && (
          <span className={cn("inline-flex items-center gap-0.5 font-medium", trend.positive ? "text-emerald-600" : "text-red-600")}>
            {trend.positive ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
            {trend.value}
          </span>
        )}
        {sub}
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl">
      {inner}
    </Link>
  ) : (
    inner
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 px-6 py-10 text-center", className)}>
      {Icon && (
        <div className="mb-1 flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon className="size-5" aria-hidden />
        </div>
      )}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Field({
  label,
  error,
  hint,
  children,
  className,
  required,
}: {
  label: string;
  error?: string;
  hint?: ReactNode;
  children: (id: string) => ReactNode;
  className?: string;
  required?: boolean;
}) {
  const id = useId();
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id} className="text-xs font-medium text-foreground/80">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </Label>
      {children(id)}
      {error ? (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

export function FilterSelect({
  value,
  onChange,
  options,
  label,
  allLabel = "All",
  className,
  size = "sm",
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  label: string;
  allLabel?: string | null;
  className?: string;
  size?: "sm" | "default";
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger size={size} aria-label={label} className={cn("min-w-32 bg-card", className)}>
        <span className="text-muted-foreground">{label}:</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {allLabel !== null && <SelectItem value="all">{allLabel}</SelectItem>}
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function LenderAvatar({ lender, size = "md" }: { lender: Pick<Lender, "initials" | "hue" | "name">; size?: "sm" | "md" | "lg" }) {
  const dims = size === "sm" ? "size-6 text-[10px]" : size === "lg" ? "size-11 text-sm" : "size-8 text-xs";
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 items-center justify-center rounded-lg font-semibold tracking-tight", dims)}
      style={{ backgroundColor: `oklch(0.94 0.04 ${lender.hue})`, color: `oklch(0.38 0.1 ${lender.hue})`, boxShadow: `inset 0 0 0 1px oklch(0.85 0.06 ${lender.hue})` }}
    >
      {lender.initials}
    </span>
  );
}

export function PersonAvatar({ name, className }: { name: string; className?: string }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
  return (
    <span aria-hidden className={cn("inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary", className)}>
      {initials}
    </span>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  destructive,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  children?: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function Callout({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: "info" | "warning" | "danger" | "success";
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  const styles = {
    info: "border-blue-200 bg-blue-50/70 text-blue-900",
    warning: "border-amber-200 bg-amber-50/80 text-amber-900",
    danger: "border-red-200 bg-red-50/70 text-red-900",
    success: "border-emerald-200 bg-emerald-50/70 text-emerald-900",
  }[tone];
  const Icon = tone === "warning" || tone === "danger" ? TriangleAlert : Info;
  return (
    <div role={tone === "danger" ? "alert" : "note"} className={cn("flex gap-2.5 rounded-lg border px-3 py-2.5 text-xs leading-relaxed", styles, className)}>
      <Icon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <div>
        {title && <p className="mb-0.5 font-semibold">{title}</p>}
        {children}
      </div>
    </div>
  );
}

export function DataRow({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4 py-1.5 text-sm", className)}>
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right font-medium text-foreground">{children}</dd>
    </div>
  );
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-9 animate-pulse rounded-md bg-muted/70" />
      ))}
    </div>
  );
}
