import type { Country, Currency } from "@/domain/types";

const localeFor = (currency: Currency): string => (currency === "CAD" ? "en-CA" : "en-US");
export const localeForCountry = (country?: Country): string => (country === "CA" ? "en-CA" : "en-US");

export function formatMoney(
  amount: number | undefined | null,
  currency: Currency = "USD",
  opts: { decimals?: boolean; compact?: boolean } = {},
): string {
  if (amount === undefined || amount === null || Number.isNaN(amount)) return "—";
  const { decimals = false, compact = false } = opts;
  return new Intl.NumberFormat(localeFor(currency), {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    notation: compact ? "compact" : "standard",
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: compact ? 1 : decimals ? 2 : 0,
  }).format(amount);
}

/** Format with an explicit currency code suffix when amounts of mixed currency may appear. */
export function formatMoneyCode(amount: number, currency: Currency, decimals = false): string {
  return `${formatMoney(amount, currency, { decimals })} ${currency}`;
}

export function formatPercent(n: number | undefined | null, digits = 1): string {
  if (n === undefined || n === null || Number.isNaN(n)) return "—";
  return `${n.toFixed(digits)}%`;
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

export function formatDate(iso: string | undefined, country?: Country): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(localeForCountry(country), { year: "numeric", month: "short", day: "numeric" }).format(d);
}

export function formatDateTime(iso: string | undefined, country?: Country): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(localeForCountry(country), {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

export function formatRelative(iso: string | undefined, now: Date = new Date()): string {
  if (!iso) return "—";
  const diff = new Date(iso).getTime() - now.getTime();
  const abs = Math.abs(diff);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  let text: string;
  if (abs < hour) text = `${Math.max(1, Math.round(abs / minute))}m`;
  else if (abs < day) text = `${Math.round(abs / hour)}h`;
  else if (abs < 45 * day) text = `${Math.round(abs / day)}d`;
  else text = `${Math.round(abs / (30 * day))}mo`;
  return diff > 0 ? `in ${text}` : `${text} ago`;
}

export function daysBetween(a: string | Date, b: string | Date): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);
}

export function addDays(base: string | Date, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export function toDateInput(iso: string | undefined): string {
  if (!iso) return "";
  return new Date(iso).toISOString().slice(0, 10);
}

export function fromDateInput(value: string): string {
  // Anchor at noon UTC so the calendar date is stable across time zones.
  return new Date(`${value}T12:00:00.000Z`).toISOString();
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit" }).format(new Date(Date.UTC(y!, m! - 1, 1)));
}
