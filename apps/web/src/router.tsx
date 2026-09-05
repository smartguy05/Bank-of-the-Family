import { createRootRoute, createRoute, createRouter, Outlet } from "@tanstack/react-router";
import { HomePlaceholder } from "./routes/HomePlaceholder";

/**
 * Code-based route tree. Feature agents replace/extend this file:
 * public routes (/login, /invite/$code, /onboarding), parent routes, kid routes.
 */
export const rootRoute = createRootRoute({ component: () => <Outlet /> });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomePlaceholder,
});

export const routeTree = rootRoute.addChildren([indexRoute]);

export const router = createRouter({ routeTree, defaultPreload: "intent" });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
