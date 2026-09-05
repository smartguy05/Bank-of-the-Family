import type { ReactNode } from "react";
import { useMe } from "@/hooks/useMe";
import { useChildDashboard } from "@/hooks/useDashboard";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomTabBar } from "@/components/layout/BottomTabBar";
import { Header } from "@/components/layout/Header";
import { CHILD_NAV, PARENT_NAV } from "@/components/layout/nav";

export function AppShell({ children }: { children: ReactNode }) {
  const { data: me } = useMe();
  const isChild = me?.user.role === "child";
  const { data: childHome } = useChildDashboard(isChild);
  const items = isChild ? CHILD_NAV : PARENT_NAV;

  return (
    <div className="flex min-h-full">
      <Sidebar items={items} familyName={me?.family?.name} />
      <div className="flex min-h-full flex-1 flex-col">
        <Header familyName={me?.family?.name} unread={childHome?.unreadNotifications} />
        <main className="flex-1 px-4 py-5 pb-24 sm:px-8 sm:py-8 sm:pb-8">
          <div className="mx-auto w-full max-w-5xl">{children}</div>
        </main>
        <BottomTabBar items={items} />
      </div>
    </div>
  );
}
