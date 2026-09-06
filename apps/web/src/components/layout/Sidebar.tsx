import { Link, useRouterState } from "@tanstack/react-router";
import { Landmark, LogOut } from "lucide-react";
import type { NavItem } from "@/components/layout/nav";
import { useLogout } from "@/hooks/useMe";
import { cn } from "@/lib/cn";

export function Sidebar({ items, familyName }: { items: NavItem[]; familyName?: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const logout = useLogout();
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-card sm:sticky sm:top-0 sm:flex sm:h-screen print:hidden">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-900 text-white">
          <Landmark size={18} />
        </div>
        <div>
          <p className="text-sm font-semibold leading-tight text-brand-900">Bank of the Family</p>
          {familyName && <p className="text-xs text-muted">{familyName}</p>}
        </div>
      </div>
      <nav aria-label="Primary" className="flex-1 overflow-y-auto px-3">
        <ul className="space-y-1">
          {items.map((item) => {
            const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
            return (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-brand-100 text-brand-900"
                      : "text-muted hover:bg-surface hover:text-ink",
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  <item.icon size={18} />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="border-t border-line px-3 py-3">
        <button
          type="button"
          disabled={logout.isPending}
          onClick={() => logout.mutate()}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-surface hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          <LogOut size={18} />
          Log out
        </button>
      </div>
    </aside>
  );
}
