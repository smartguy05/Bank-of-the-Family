import type { LucideIcon } from "lucide-react";
import { Home, LayoutGrid, Inbox, FileText, MoreHorizontal, Target } from "lucide-react";

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
}

export const PARENT_NAV: NavItem[] = [
  { label: "Home", to: "/", icon: Home },
  { label: "Kids", to: "/children", icon: LayoutGrid },
  { label: "Requests", to: "/requests", icon: Inbox },
  { label: "Statements", to: "/statements", icon: FileText },
  { label: "More", to: "/more", icon: MoreHorizontal },
];

export const CHILD_NAV: NavItem[] = [
  { label: "Home", to: "/", icon: Home },
  { label: "Accounts", to: "/accounts", icon: LayoutGrid },
  { label: "Goals", to: "/goals", icon: Target },
  { label: "Requests", to: "/requests", icon: Inbox },
  { label: "More", to: "/more", icon: MoreHorizontal },
];
