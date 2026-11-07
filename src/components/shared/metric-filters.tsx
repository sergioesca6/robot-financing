"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CUSTOMER_TYPE_LABEL, FINANCING_TYPE_LABEL } from "@/domain/labels";
import { DEFAULT_FILTERS, RANGE_LABEL, type DateRange, type MetricFilters } from "@/lib/metrics";
import { useData } from "@/store/store";
import { FilterSelect } from "./page";

export function MetricFilterBar({
  value,
  onChange,
  extended = false,
}: {
  value: MetricFilters;
  onChange: (f: MetricFilters) => void;
  extended?: boolean;
}) {
  const data = useData();
  const set = <K extends keyof MetricFilters>(k: K, v: MetricFilters[K]) => onChange({ ...value, [k]: v });
  const dirty = JSON.stringify(value) !== JSON.stringify(DEFAULT_FILTERS);
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="Filters">
      <FilterSelect
        label="Date range"
        value={value.range}
        onChange={(v) => set("range", v as DateRange)}
        allLabel={null}
        options={(Object.keys(RANGE_LABEL) as DateRange[]).map((r) => ({ value: r, label: RANGE_LABEL[r] }))}
      />
      <FilterSelect label="Country" value={value.country} onChange={(v) => set("country", v as MetricFilters["country"])} options={[{ value: "US", label: "United States" }, { value: "CA", label: "Canada" }]} />
      <FilterSelect label="Financing" value={value.financingType} onChange={(v) => set("financingType", v as MetricFilters["financingType"])} options={Object.entries(FINANCING_TYPE_LABEL).map(([value, label]) => ({ value, label }))} />
      <FilterSelect label="Employee" value={value.employeeId} onChange={(v) => set("employeeId", v)} options={data.employees.map((e) => ({ value: e.id, label: e.name }))} />
      {extended && (
        <>
          <FilterSelect label="Customer" value={value.customerType} onChange={(v) => set("customerType", v as MetricFilters["customerType"])} options={Object.entries(CUSTOMER_TYPE_LABEL).map(([value, label]) => ({ value, label }))} />
          <FilterSelect label="Lender" value={value.lenderId} onChange={(v) => set("lenderId", v)} options={data.lenders.map((l) => ({ value: l.id, label: l.name }))} />
        </>
      )}
      {dirty && (
        <Button variant="ghost" size="sm" onClick={() => onChange(DEFAULT_FILTERS)}>
          <RotateCcw /> Reset
        </Button>
      )}
    </div>
  );
}
