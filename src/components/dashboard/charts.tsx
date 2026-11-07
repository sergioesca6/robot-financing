"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART } from "@/lib/chart-colors";
import { formatMoney } from "@/lib/format";
import type { LenderStat, MonthPoint, ProductStat } from "@/lib/metrics";

const axisProps = { tick: { fontSize: 11, fill: CHART.axis }, tickLine: false, axisLine: false } as const;

const tooltipStyle = {
  contentStyle: { borderRadius: 8, border: "1px solid #e6e9f0", boxShadow: "0 4px 12px rgba(16,24,40,.08)", fontSize: 12 },
  labelStyle: { fontWeight: 600, marginBottom: 4 },
};

export function ApplicationVolumeChart({ data }: { data: MonthPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid stroke={CHART.grid} vertical={false} />
        <XAxis dataKey="label" {...axisProps} />
        <YAxis allowDecimals={false} {...axisProps} />
        <Tooltip {...tooltipStyle} cursor={{ fill: "#f1f4f9" }} formatter={(v) => [v, "Applications"]} />
        <Bar dataKey="applications" fill={CHART.navy} radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DecisionsChart({ data }: { data: MonthPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid stroke={CHART.grid} vertical={false} />
        <XAxis dataKey="label" {...axisProps} />
        <YAxis allowDecimals={false} {...axisProps} />
        <Tooltip {...tooltipStyle} cursor={{ fill: "#f1f4f9" }} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="approved" name="Approved" fill={CHART.green} radius={[4, 4, 0, 0]} maxBarSize={14} />
        <Bar dataKey="declined" name="Declined" fill={CHART.red} radius={[4, 4, 0, 0]} maxBarSize={14} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function VolumeChart({ data }: { data: MonthPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="reqFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART.blue} stopOpacity={0.22} />
            <stop offset="100%" stopColor={CHART.blue} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={CHART.grid} vertical={false} />
        <XAxis dataKey="label" {...axisProps} />
        <YAxis {...axisProps} tickFormatter={(v: number) => formatMoney(v, "USD", { compact: true })} width={56} />
        <Tooltip {...tooltipStyle} formatter={(v) => formatMoney(Number(v), "USD")} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        <Area type="monotone" dataKey="requestedVolume" name="Requested" stroke={CHART.blue} strokeWidth={2} fill="url(#reqFill)" />
        <Area type="monotone" dataKey="fundedVolume" name="Funded" stroke={CHART.teal} strokeWidth={2} fill="transparent" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function LenderChart({ data }: { data: LenderStat[] }) {
  const rows = [...data].sort((a, b) => b.submissions - a.submissions).map((d) => ({ name: d.name.replace(/ (Equipment Finance|Capital Partners|Robotics Credit|Consumer Lending|Lease Corp|Bank|Growth Finance|Community Credit Union|Micro-Lending)$/, ""), full: d.name, submissions: d.submissions }));
  return (
    <ResponsiveContainer width="100%" height={Math.max(220, rows.length * 34)}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 0 }}>
        <CartesianGrid stroke={CHART.grid} horizontal={false} />
        <XAxis type="number" allowDecimals={false} {...axisProps} />
        <YAxis type="category" dataKey="name" width={84} {...axisProps} />
        <Tooltip {...tooltipStyle} cursor={{ fill: "#f1f4f9" }} labelFormatter={(_, p) => p?.[0]?.payload?.full ?? ""} formatter={(v) => [v, "Submissions"]} />
        <Bar dataKey="submissions" fill={CHART.teal} radius={[0, 4, 4, 0]} maxBarSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ProductChart({ data }: { data: ProductStat[] }) {
  const rows = data.map((d) => ({ name: d.type === "loan" ? "Loan" : "Lease", value: d.applications, volume: d.volumeUsd }));
  const total = rows.reduce((s, r) => s + r.value, 0);
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie data={rows} dataKey="value" nameKey="name" innerRadius={58} outerRadius={84} paddingAngle={3} stroke="none">
            <Cell fill={CHART.navy} />
            <Cell fill={CHART.teal} />
          </Pie>
          <Tooltip {...tooltipStyle} formatter={(v, n, p) => [`${v} applications · ${formatMoney(p.payload.volume, "USD", { compact: true })}`, n]} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-x-0 top-[78px] text-center">
        <div className="tnum text-2xl font-semibold">{total}</div>
        <div className="text-[11px] text-muted-foreground">applications</div>
      </div>
    </div>
  );
}
