import { createFileRoute } from "@tanstack/react-router";
import { isCronAuthorized, runSocialPost } from "@/lib/socialPublish.server";

async function handle(request: Request) {
  if (!isCronAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dry") === "1";
  const indexRaw = url.searchParams.get("index");
  const index = indexRaw != null ? Number(indexRaw) : undefined;

  const result = await runSocialPost({
    channel: "facebook",
    dryRun,
    index: Number.isFinite(index) ? index : undefined,
  });

  const status = result.ok ? 200 : 502;
  return Response.json(result, { status });
}

export const Route = createFileRoute("/api/cron/social-post")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
      POST: async ({ request }) => handle(request),
    },
  },
});
