import {
  BarChart3,
  Bell,
  BadgePercent,
  Calculator,
  Coins,
  FileText,
  FolderOpen,
  Landmark,
  LayoutDashboard,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/applications", label: "Applications", icon: FileText },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/lenders", label: "Lenders", icon: Landmark },
  { href: "/offers", label: "Financing Offers", icon: BadgePercent },
  { href: "/calculator", label: "Payment Calculator", icon: Calculator },
  { href: "/documents", label: "Documents", icon: FolderOpen },
  { href: "/commissions", label: "Commissions", icon: Coins },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
