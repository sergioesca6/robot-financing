"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Search, Users } from "lucide-react";
import { LenderAvatar } from "@/components/shared/page";
import { customerDisplayName } from "@/lib/selectors";
import { useData } from "@/store/store";

interface Hit {
  key: string;
  href: string;
  title: string;
  sub: string;
  kind: "application" | "customer" | "lender";
}

export function GlobalSearch() {
  const data = useData();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, []);

  const hits = useMemo<Hit[]>(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    const custMap = new Map(data.customers.map((c) => [c.id, c]));
    const apps: Hit[] = data.applications
      .filter((a) => {
        const c = custMap.get(a.customerId);
        return [a.id, a.robot.model, a.robot.manufacturer, customerDisplayName(c), c?.name ?? ""].some((s) => s.toLowerCase().includes(term));
      })
      .slice(0, 5)
      .map((a) => ({
        key: a.id,
        href: `/applications/${a.id}`,
        title: `${a.id} · ${customerDisplayName(custMap.get(a.customerId))}`,
        sub: `${a.robot.manufacturer} ${a.robot.model}`,
        kind: "application" as const,
      }));
    const custs: Hit[] = data.customers
      .filter((c) => [c.name, c.companyName ?? "", c.email].some((s) => s.toLowerCase().includes(term)))
      .slice(0, 4)
      .map((c) => ({ key: c.id, href: `/customers/${c.id}`, title: customerDisplayName(c), sub: c.email, kind: "customer" as const }));
    const lends: Hit[] = data.lenders
      .filter((l) => l.name.toLowerCase().includes(term))
      .slice(0, 3)
      .map((l) => ({ key: l.id, href: `/lenders/${l.id}`, title: l.name, sub: "Lender", kind: "lender" as const }));
    return [...apps, ...custs, ...lends];
  }, [q, data]);

  const go = (hit: Hit) => {
    setOpen(false);
    setQ("");
    router.push(hit.href);
  };

  return (
    <div ref={wrapRef} className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, hits.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter" && hits[active]) {
            go(hits[active]!);
          } else if (e.key === "Escape") {
            setOpen(false);
            inputRef.current?.blur();
          }
        }}
        role="combobox"
        aria-expanded={open && hits.length > 0}
        aria-controls="global-search-results"
        aria-label="Search applications, customers and lenders"
        placeholder="Search applications, customers, lenders…"
        className="h-9 w-full rounded-lg border bg-muted/60 pl-8 pr-12 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:bg-card focus:ring-3 focus:ring-ring/30"
      />
      <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border bg-card px-1.5 font-mono text-[10px] text-muted-foreground sm:block">⌘K</kbd>
      {open && q.trim() && (
        <div id="global-search-results" role="listbox" className="absolute left-0 right-0 top-full z-50 mt-1.5 overflow-hidden rounded-lg border bg-popover shadow-lg">
          {hits.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-muted-foreground">No results for “{q}”.</p>
          ) : (
            <ul className="max-h-80 overflow-auto p-1">
              {hits.map((h, i) => {
                const lender = h.kind === "lender" ? data.lenders.find((l) => l.id === h.key) : undefined;
                return (
                  <li key={`${h.kind}-${h.key}`} role="option" aria-selected={i === active}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => go(h)}
                      onMouseEnter={() => setActive(i)}
                      className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm ${i === active ? "bg-muted" : ""}`}
                    >
                      {lender ? (
                        <LenderAvatar lender={lender} size="sm" />
                      ) : h.kind === "application" ? (
                        <FileText className="size-4 text-muted-foreground" />
                      ) : (
                        <Users className="size-4 text-muted-foreground" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{h.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">{h.sub}</span>
                      </span>
                      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{h.kind}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

