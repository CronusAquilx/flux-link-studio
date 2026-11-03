import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/m/$slug")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { resolveLink } = await import("@/lib/redirect.server");
        return resolveLink(params.slug, "flux_mini");
      },
    },
  },
});
