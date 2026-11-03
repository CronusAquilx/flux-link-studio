import { createFileRoute } from "@tanstack/react-router";
import { resolveLink } from "@/lib/redirect.server";

export const Route = createFileRoute("/m/$slug")({
  server: { handlers: { GET: async ({ params }) => resolveLink(params.slug, "flux_mini") } },
});
