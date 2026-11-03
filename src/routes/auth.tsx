import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

export const Route = createFileRoute("/auth")({
  validateSearch: z.object({ redirect: z.string().optional() }),
  head: () => ({ meta: [{ title: "Sign in · Flux Links" }, { name: "description", content: "Sign in to Flux Links." }] }),
  component: () => <div className="p-8 text-sm text-muted-foreground">Sign-in screen not built yet.</div>,
});
