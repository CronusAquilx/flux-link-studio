import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// After a new version goes live, old page chunks disappear. Reload once to fetch the new version
// instead of showing a blank screen; a sessionStorage flag prevents reload loops.
if (typeof window !== "undefined" && !(window as { __fluxPreloadGuard?: boolean }).__fluxPreloadGuard) {
  (window as { __fluxPreloadGuard?: boolean }).__fluxPreloadGuard = true;
  const KEY = "flux-chunk-reload";
  const recover = () => {
    const last = Number(sessionStorage.getItem(KEY) ?? 0);
    if (Date.now() - last < 10_000) return;
    sessionStorage.setItem(KEY, String(Date.now()));
    window.location.reload();
  };
  window.addEventListener("vite:preloadError", (e) => {
    e.preventDefault();
    recover();
  });
  window.addEventListener("unhandledrejection", (e) => {
    const msg = String((e.reason as Error | undefined)?.message ?? e.reason ?? "");
    if (/Failed to fetch dynamically imported module|Importing a module script failed/i.test(msg)) recover();
  });
}

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
