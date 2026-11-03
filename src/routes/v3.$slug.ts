import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/v3/$slug")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { resolveLink } = await import("@/lib/redirect.server");
        return resolveLink(params.slug, "flux_v3");
      },
    },
  },
});
