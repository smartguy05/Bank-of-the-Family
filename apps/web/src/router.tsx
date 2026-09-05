import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { z } from "zod";
import type { Me } from "@botf/shared";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { ToastProvider } from "@/components/ui/Toast";
import { AppShell } from "@/components/layout/AppShell";

import { LoginPage } from "@/routes/LoginPage";
import { OnboardingPage } from "@/routes/OnboardingPage";
import { InvitePage } from "@/routes/InvitePage";
import { HomePage } from "@/routes/HomePage";
import { ChildrenPage } from "@/routes/parent/ChildrenPage";
import { ChildDetailPage } from "@/routes/parent/ChildDetailPage";
import { SettingsPage } from "@/routes/parent/SettingsPage";
import { AccountsPage } from "@/routes/AccountsPage";
import { AccountDetailPage } from "@/routes/AccountDetailPage";
import { RequestsPage } from "@/routes/RequestsPage";
import { GoalsPage } from "@/routes/GoalsPage";
import { StatementsPage } from "@/routes/StatementsPage";
import { NotificationsPage } from "@/routes/NotificationsPage";
import { MorePage } from "@/routes/MorePage";
import { ProfilePage } from "@/routes/ProfilePage";
import { NotFoundPage } from "@/routes/NotFoundPage";

interface RouterContext {
  queryClient: QueryClient;
}

export const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: () => (
    <ToastProvider>
      <Outlet />
    </ToastProvider>
  ),
  notFoundComponent: NotFoundPage,
});

async function fetchMe(queryClient: QueryClient): Promise<Me> {
  return queryClient.ensureQueryData({
    queryKey: queryKeys.me(),
    queryFn: () => api.get<Me>("/auth/me"),
  });
}

const loginSearchSchema = z.object({ error: z.string().optional() });

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  validateSearch: loginSearchSchema,
  component: LoginPage,
});

const onboardingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/onboarding",
  beforeLoad: async ({ context }) => {
    let me: Me;
    try {
      me = await fetchMe(context.queryClient);
    } catch {
      throw redirect({ to: "/login" });
    }
    if (me.user.role === "child") throw redirect({ to: "/" });
    if (me.family) throw redirect({ to: "/" });
  },
  component: OnboardingPage,
});

export const inviteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/invite/$code",
  component: InvitePage,
});

/** Layout route: guards sign-in and resolves the family before any child route loads. */
const authedRoute = createRoute({
  id: "authed",
  getParentRoute: () => rootRoute,
  beforeLoad: async ({ context }) => {
    let me: Me;
    try {
      me = await fetchMe(context.queryClient);
    } catch {
      throw redirect({ to: "/login" });
    }
    if (me.user.role === "parent" && !me.family) {
      if (me.pendingInviteCode) {
        throw redirect({ to: "/invite/$code", params: { code: me.pendingInviteCode } });
      }
      throw redirect({ to: "/onboarding" });
    }
    return { me };
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/",
  component: HomePage,
});

const childrenIndexRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/children",
  beforeLoad: ({ context }) => {
    if (context.me.user.role !== "parent") throw redirect({ to: "/" });
  },
  component: ChildrenPage,
});

export const childDetailRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/children/$childId",
  beforeLoad: ({ context }) => {
    if (context.me.user.role !== "parent") throw redirect({ to: "/" });
  },
  component: ChildDetailPage,
});

const settingsRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/settings",
  beforeLoad: ({ context }) => {
    if (context.me.user.role !== "parent") throw redirect({ to: "/" });
  },
  component: SettingsPage,
});

const accountsIndexRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/accounts",
  component: AccountsPage,
});

const accountDetailSearchSchema = z.object({ tx: z.string().optional() });

export const accountDetailRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/accounts/$accountId",
  validateSearch: accountDetailSearchSchema,
  component: AccountDetailPage,
});

const requestsRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/requests",
  component: RequestsPage,
});

const goalsRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/goals",
  component: GoalsPage,
});

const statementsRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/statements",
  component: StatementsPage,
});

const notificationsRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/notifications",
  component: NotificationsPage,
});

const moreRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/more",
  component: MorePage,
});

const profileRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/profile",
  component: ProfilePage,
});

const authedTree = authedRoute.addChildren([
  indexRoute,
  childrenIndexRoute,
  childDetailRoute,
  settingsRoute,
  accountsIndexRoute,
  accountDetailRoute,
  requestsRoute,
  goalsRoute,
  statementsRoute,
  notificationsRoute,
  moreRoute,
  profileRoute,
]);

export const routeTree = rootRoute.addChildren([
  loginRoute,
  onboardingRoute,
  inviteRoute,
  authedTree,
]);

export function createAppRouter(queryClient: QueryClient) {
  return createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
  });
}
