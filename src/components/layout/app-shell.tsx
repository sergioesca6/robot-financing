"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Bell, ChevronsLeft, ChevronsRight, Menu, RotateCcw, ShieldCheck, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { ConfirmDialog, PersonAvatar } from "@/components/shared/page";
import { ROLE_LABEL } from "@/domain/labels";
import type { Role } from "@/domain/types";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useStore } from "@/store/store";
import { Breadcrumbs } from "./breadcrumbs";
import { GlobalSearch } from "./global-search";
import { NAV_ITEMS, isActive } from "./nav";
import { toast } from "sonner";

function Logo({ collapsed }: { collapsed?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5 px-1" aria-label="Robot Finance home">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="4" y="8" width="16" height="11" rx="3" />
          <path d="M12 8V4" />
          <circle cx="12" cy="3.5" r="1" />
          <path d="M9 13.5h.01M15 13.5h.01M9.5 16.5h5" />
        </svg>
      </span>
      {!collapsed && (
        <span className="leading-tight">
          <span className="block text-[15px] font-semibold tracking-tight text-sidebar-accent-foreground">Robot Finance</span>
          <span className="block text-[10px] font-medium uppercase tracking-[0.14em] text-sidebar-foreground/60">Dealer F&amp;I</span>
        </span>
      )}
    </Link>
  );
}

function NavList({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { data } = useStore();
  const unread = data.notifications.filter((n) => !n.read).length;
  return (
    <nav aria-label="Primary" className="flex flex-col gap-0.5">
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            title={collapsed ? item.label : undefined}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex items-center gap-3 rounded-lg px-2.5 py-2 text-[13px] font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              active && "bg-sidebar-accent text-sidebar-accent-foreground",
              collapsed && "justify-center px-0",
            )}
          >
            {active && <span className="absolute left-0 top-1.5 h-[calc(100%-12px)] w-0.5 rounded-full bg-sidebar-primary" aria-hidden />}
            <Icon className={cn("size-[18px] shrink-0", active ? "text-sidebar-primary" : "text-sidebar-foreground/60 group-hover:text-sidebar-foreground")} aria-hidden />
            {!collapsed && <span className="truncate">{item.label}</span>}
            {item.href === "/notifications" && unread > 0 && (
              <span
                className={cn(
                  "ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-sidebar-primary px-1.5 text-[10px] font-semibold text-sidebar-primary-foreground",
                  collapsed && "absolute right-1.5 top-1 ml-0 size-2 min-w-0 p-0",
                )}
              >
                {collapsed ? "" : unread}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarFooter({ collapsed }: { collapsed?: boolean }) {
  if (collapsed) return null;
  return (
    <div className="rounded-lg border border-sidebar-border bg-sidebar-accent/50 p-3 text-[11px] leading-relaxed text-sidebar-foreground/70">
      <p className="mb-1 flex items-center gap-1.5 font-semibold text-sidebar-accent-foreground">
        <ShieldCheck className="size-3.5 text-sidebar-primary" aria-hidden /> Demo mode
      </p>
      Fictional data. Nothing is sent to lenders, customers or banks.
    </div>
  );
}

function NotificationBell() {
  const { data, actions } = useStore();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const unread = data.notifications.filter((n) => !n.read).length;
  const latest = data.notifications.slice(0, 6);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative size-9" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}>
          <Bell className="size-[18px]" />
          {unread > 0 && (
            <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-4 text-white">{unread > 9 ? "9+" : unread}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] gap-0 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <p className="text-sm font-semibold">Notifications</p>
          <Button variant="ghost" size="xs" onClick={() => actions.markAllNotificationsRead()} disabled={!unread}>
            Mark all read
          </Button>
        </div>
        <ul className="max-h-80 divide-y overflow-auto">
          {latest.map((n) => (
            <li key={n.id}>
              <button
                className="flex w-full gap-2.5 px-3 py-2.5 text-left hover:bg-muted/60"
                onClick={() => {
                  actions.markNotification(n.id, true);
                  setOpen(false);
                  if (n.link) router.push(n.link);
                }}
              >
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-blue-500")} aria-label={n.read ? "Read" : "Unread"} />
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium">{n.title}</span>
                  <span className="line-clamp-2 text-xs text-muted-foreground">{n.body}</span>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground/80">{formatRelative(n.createdAt)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="border-t p-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => {
              setOpen(false);
              router.push("/notifications");
            }}
          >
            View all notifications
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function UserMenu() {
  const { data, actions, currentUser, can } = useStore();
  const [confirmReset, setConfirmReset] = useState(false);
  const roles: Role[] = ["administrator", "finance_manager", "sales_rep"];
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-left outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/40" aria-label="Account and demo role">
            <PersonAvatar name={currentUser.name} className="size-8 text-xs" />
            <span className="hidden leading-tight md:block">
              <span className="block text-[13px] font-medium">{currentUser.name}</span>
              <span className="block text-[11px] text-muted-foreground">{ROLE_LABEL[currentUser.role]}</span>
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-foreground">{currentUser.name}</span>
            <span className="text-xs font-normal text-muted-foreground">{currentUser.email}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
            <UserCog className="size-3.5" /> Demo role switcher
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={currentUser.role}
            onValueChange={(role) => {
              const emp = data.employees.find((e) => e.role === role && e.active);
              if (emp) {
                actions.setCurrentUser(emp.id);
                toast.success(`Viewing as ${emp.name} (${ROLE_LABEL[role as Role]})`, { description: "UI simulation only — not real authorization." });
              }
            }}
          >
            {roles.map((r) => (
              <DropdownMenuRadioItem key={r} value={r}>
                {ROLE_LABEL[r]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={!can("demo.reset")} onSelect={() => setConfirmReset(true)}>
            <RotateCcw className="size-4" /> Reset demo data
            {!can("demo.reset") && <span className="ml-auto text-[10px] text-muted-foreground">Admin</span>}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset demo data?"
        description="This restores the original seeded applications, lenders, offers and settings. Your local changes will be lost."
        confirmLabel="Reset demo data"
        destructive
        onConfirm={() => {
          actions.resetDemo();
          toast.success("Demo data reset to the original seed.");
        }}
      />
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  // AppShell only mounts after the store hydrates on the client, so reading localStorage here is safe.
  const [collapsed, setCollapsed] = useState(() => window.localStorage.getItem("rf-sidebar-collapsed") === "1");
  const [mobileOpen, setMobileOpen] = useState(false);
  const { currentUser } = useStore();

  const toggle = () => {
    setCollapsed((c) => {
      window.localStorage.setItem("rf-sidebar-collapsed", c ? "0" : "1");
      return !c;
    });
  };

  return (
    <div className="flex min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:shadow">
        Skip to content
      </a>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col gap-4 border-r border-sidebar-border bg-sidebar p-3 transition-[width] duration-200 lg:flex",
          collapsed ? "w-[68px]" : "w-60",
        )}
      >
        <div className={cn("flex h-10 items-center", collapsed && "justify-center")}>
          <Logo collapsed={collapsed} />
        </div>
        <div className="flex-1 overflow-y-auto">
          <NavList collapsed={collapsed} />
        </div>
        <SidebarFooter collapsed={collapsed} />
        <button
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          {collapsed ? <ChevronsRight className="mx-auto size-4" /> : <><ChevronsLeft className="size-4" /> Collapse</>}
        </button>
      </aside>

      {/* Mobile drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 gap-4 border-sidebar-border bg-sidebar p-3 text-sidebar-foreground" showCloseButton={false}>
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">Primary navigation</SheetDescription>
          <div className="flex h-10 items-center">
            <Logo />
          </div>
          <div className="flex-1 overflow-y-auto">
            <NavList onNavigate={() => setMobileOpen(false)} />
          </div>
          <SidebarFooter />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-card/90 px-3 backdrop-blur sm:gap-3 sm:px-5">
          <Button variant="ghost" size="icon" className="size-9 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
            <Menu className="size-5" />
          </Button>
          <GlobalSearch />
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <span className="hidden items-center gap-1.5 rounded-full border border-amber-300/70 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800 md:inline-flex">
              <span className="size-1.5 rounded-full bg-amber-500" /> Demo mode
            </span>
            {currentUser.role === "sales_rep" && (
              <span className="hidden rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground xl:inline">Limited sales view</span>
            )}
            <NotificationBell />
            <UserMenu />
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-[1520px] flex-1 px-4 py-5 sm:px-6">
          <Breadcrumbs />
          {children}
        </main>
        <footer className="border-t px-6 py-3 text-center text-[11px] text-muted-foreground">
          Robot Finance prototype · fictional data · estimates only, not credit decisions · role switcher is a UI simulation
        </footer>
      </div>
    </div>
  );
}
