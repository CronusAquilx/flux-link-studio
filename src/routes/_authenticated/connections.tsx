import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/connections")({
  head: () => ({ meta: [{ title: "Connections · Flux Links" }] }),
  component: () => (
    <div>
      <h1 className="text-lg font-semibold">Connections</h1>
      <p className="mt-2 text-sm text-muted-foreground">This screen hasn't been built yet.</p>
    </div>
  ),
});
