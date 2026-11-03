import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/projects")({
  head: () => ({ meta: [{ title: "Projects · Flux Links" }] }),
  component: () => (
    <div>
      <h1 className="text-lg font-semibold">Projects</h1>
      <p className="mt-2 text-sm text-muted-foreground">This screen hasn't been built yet.</p>
    </div>
  ),
});
