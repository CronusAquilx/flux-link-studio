import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/links")({
  head: () => ({ meta: [{ title: "Links · Flux Links" }] }),
  component: () => (
    <div>
      <h1 className="text-lg font-semibold">Links</h1>
      <p className="mt-2 text-sm text-muted-foreground">This screen hasn't been built yet.</p>
    </div>
  ),
});
