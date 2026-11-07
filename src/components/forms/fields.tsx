"use client";

import { Controller, useFormContext, type FieldValues } from "react-hook-form";
import { Field } from "@/components/shared/page";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Opt = { value: string; label: string };

function useErr(name: string): string | undefined {
  const {
    formState: { errors },
  } = useFormContext<FieldValues>();
  const parts = name.split(".");
  let cur: unknown = errors;
  for (const p of parts) cur = (cur as Record<string, unknown> | undefined)?.[p];
  return (cur as { message?: string } | undefined)?.message;
}

export function TextField({
  name,
  label,
  type = "text",
  placeholder,
  hint,
  required,
  className,
  disabled,
  autoComplete,
}: {
  name: string;
  label: string;
  type?: string;
  placeholder?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  disabled?: boolean;
  autoComplete?: string;
}) {
  const { register } = useFormContext<FieldValues>();
  const error = useErr(name);
  return (
    <Field label={label} error={error} hint={hint} required={required} className={className}>
      {(id) => (
        <Input id={id} type={type} placeholder={placeholder} disabled={disabled} autoComplete={autoComplete} aria-invalid={!!error} {...register(name)} className="h-9" />
      )}
    </Field>
  );
}

export function NumField({
  name,
  label,
  prefix,
  suffix,
  step,
  hint,
  required,
  className,
  disabled,
  min,
  placeholder,
}: {
  name: string;
  label: string;
  prefix?: string;
  suffix?: string;
  step?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  disabled?: boolean;
  min?: number;
  placeholder?: string;
}) {
  const { register } = useFormContext<FieldValues>();
  const error = useErr(name);
  return (
    <Field label={label} error={error} hint={hint} required={required} className={className}>
      {(id) => (
        <div className="relative">
          {prefix && <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{prefix}</span>}
          <Input
            id={id}
            type="number"
            inputMode="decimal"
            step={step ?? "any"}
            min={min}
            disabled={disabled}
            placeholder={placeholder}
            aria-invalid={!!error}
            {...register(name, { setValueAs: (v) => (v === "" || v === null || v === undefined || Number.isNaN(Number(v)) ? undefined : Number(v)) })}
            className={cn("tnum h-9", prefix && "pl-6", suffix && "pr-9")}
          />
          {suffix && <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{suffix}</span>}
        </div>
      )}
    </Field>
  );
}

export function SelectField({
  name,
  label,
  options,
  placeholder = "Select…",
  hint,
  required,
  className,
  disabled,
  onValueChange,
}: {
  name: string;
  label: string;
  options: Opt[];
  placeholder?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  disabled?: boolean;
  onValueChange?: (v: string) => void;
}) {
  const { control } = useFormContext<FieldValues>();
  const error = useErr(name);
  return (
    <Field label={label} error={error} hint={hint} required={required} className={className}>
      {(id) => (
        <Controller
          control={control}
          name={name}
          render={({ field }) => (
            <Select
              value={field.value === undefined || field.value === null ? "" : String(field.value)}
              onValueChange={(v) => {
                field.onChange(v);
                onValueChange?.(v);
              }}
              disabled={disabled}
            >
              <SelectTrigger id={id} className="h-9 w-full bg-transparent" aria-invalid={!!error}>
                <SelectValue placeholder={placeholder} />
              </SelectTrigger>
              <SelectContent>
                {options.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      )}
    </Field>
  );
}

export function AreaField({ name, label, placeholder, hint, rows = 3 }: { name: string; label: string; placeholder?: string; hint?: string; rows?: number }) {
  const { register } = useFormContext<FieldValues>();
  const error = useErr(name);
  return (
    <Field label={label} error={error} hint={hint}>
      {(id) => <Textarea id={id} rows={rows} placeholder={placeholder} {...register(name)} />}
    </Field>
  );
}
