// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

/** Lovable defaults to Cloudflare; on Vercel CI set Nitro preset so routes + SSR work. */
const isVercelDeploy =
  Boolean(process.env.VERCEL) || process.env.NITRO_PRESET === "vercel";
const nitroPreset = isVercelDeploy ? "vercel" : "cloudflare-module";

export default defineConfig({
  nitro: {
    preset: nitroPreset,
    // Lovable forces Nitro output into dist/ — Vercel expects Build Output API in .vercel/output/.
    ...(isVercelDeploy
      ? {
          output: {
            dir: ".vercel/output",
            publicDir: ".vercel/output/static",
            serverDir: ".vercel/output/functions/__server.func",
          },
        }
      : {}),
    routeRules: {
      "/_serverFn/**": {
        maxDuration: 300,
      },
      "/api/generate-itinerary": {
        maxDuration: 300,
      },
    },
  } as any,
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
