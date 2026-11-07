"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { customerDisplayName } from "@/lib/selectors";
import { useData } from "@/store/store";

const SEGMENT_LABEL: Record<string, string> = {
  applications: "Applications",
  customers: "Customers",
  lenders: "Lenders",
  offers: "Financing Offers",
  calculator: "Payment Calculator",
  documents: "Documents",
  commissions: "Commissions",
  notifications: "Notifications",
  reports: "Reports",
  settings: "Settings",
  new: "New application",
  edit: "Edit",
};

export function Breadcrumbs() {
  const pathname = usePathname();
  const data = useData();
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return <div className="h-5" />;

  const crumbs = parts.map((part, i) => {
    const href = `/${parts.slice(0, i + 1).join("/")}`;
    let label = SEGMENT_LABEL[part];
    if (!label) {
      const prev = parts[i - 1];
      if (prev === "applications") label = part;
      else if (prev === "customers") label = customerDisplayName(data.customers.find((c) => c.id === part));
      else if (prev === "lenders") label = data.lenders.find((l) => l.id === part)?.name ?? part;
      else label = part;
    }
    return { href, label };
  });

  return (
    <nav aria-label="Breadcrumb" className="mb-3 text-xs text-muted-foreground">
      <ol className="flex flex-wrap items-center gap-1">
        <li>
          <Link href="/" className="hover:text-foreground">
            Home
          </Link>
        </li>
        {crumbs.map((c, i) => (
          <li key={c.href} className="flex items-center gap-1">
            <ChevronRight className="size-3 opacity-60" aria-hidden />
            {i === crumbs.length - 1 ? (
              <span aria-current="page" className="font-medium text-foreground">
                {c.label}
              </span>
            ) : (
              <Link href={c.href} className="hover:text-foreground">
                {c.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
