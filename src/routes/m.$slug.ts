import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/m/$slug")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const { resolveLink } = await import("@/lib/redirect.server");
        return resolveLink(params.slug, "flux_mini", request.headers);
      },
    },
  },
});
