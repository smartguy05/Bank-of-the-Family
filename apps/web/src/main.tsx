import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { createAppRouter } from "./router";
import { onUnauthorized } from "./lib/api";
import { queryKeys } from "./lib/queryKeys";
import { registerSW } from "./lib/pwa";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 15_000, refetchOnWindowFocus: true } },
});

// A 401 on any authenticated request means the session ended (or was never valid).
// Re-fetching `me` triggers the router's beforeLoad guards to redirect to /login.
onUnauthorized(() => {
  void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
});

const router = createAppRouter(queryClient);

registerSW();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
);

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
