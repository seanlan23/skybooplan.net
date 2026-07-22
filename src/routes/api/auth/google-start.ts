import { Auth } from "@auth/core";
import { createFileRoute } from "@tanstack/react-router";
import { createAuthConfig } from "@/lib/auth.config";
import { ensureAuthEnv } from "@/lib/auth.env";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Server-side Google OAuth starter.
 * Avoids browser fetch("/api/auth/csrf") which Safari reports as "Load failed".
 */
export const Route = createFileRoute("/api/auth/google-start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          ensureAuthEnv();
          const config = createAuthConfig();
          const url = new URL(request.url);
          const callbackUrl =
            url.searchParams.get("callbackUrl")?.trim() ||
            `${url.origin}/auth/callback`;

          const csrfReq = new Request(new URL("/api/auth/csrf", url.origin), {
            method: "GET",
            headers: request.headers,
          });
          const csrfRes = await Auth(csrfReq, config);
          if (!csrfRes.ok) {
            return Response.redirect(`${url.origin}/login?error=csrf`, 302);
          }

          const csrfData = (await csrfRes.json()) as { csrfToken?: string };
          const csrfToken = csrfData.csrfToken?.trim();
          if (!csrfToken) {
            return Response.redirect(`${url.origin}/login?error=csrf`, 302);
          }

          const html = `<!DOCTYPE html>
<html lang="sl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Google prijava — Skybooplan</title>
  </head>
  <body>
    <p style="font-family:system-ui,sans-serif;text-align:center;margin-top:20vh">
      Preusmerjam na Google…
    </p>
    <form id="google-oauth" method="POST" action="/api/auth/signin/google">
      <input type="hidden" name="csrfToken" value="${escapeHtml(csrfToken)}" />
      <input type="hidden" name="callbackUrl" value="${escapeHtml(callbackUrl)}" />
    </form>
    <script>document.getElementById("google-oauth").submit();</script>
  </body>
</html>`;

          const headers = new Headers({
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
          });

          const getSetCookie = (
            csrfRes.headers as Headers & { getSetCookie?: () => string[] }
          ).getSetCookie?.();
          if (getSetCookie?.length) {
            for (const cookie of getSetCookie) headers.append("Set-Cookie", cookie);
          } else {
            const single = csrfRes.headers.get("set-cookie");
            if (single) headers.append("Set-Cookie", single);
          }

          return new Response(html, { status: 200, headers });
        } catch (error) {
          console.error("[auth/google-start] failed:", error);
          const origin = new URL(request.url).origin;
          return Response.redirect(`${origin}/login?error=google`, 302);
        }
      },
    },
  },
});
