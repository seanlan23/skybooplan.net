// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

/** Lovable defaults to Cloudflare; on Vercel CI set Nitro preset so routes + SSR work. */
const nitroPreset =
  process.env.VERCEL || process.env.NITRO_PRESET === "vercel"
    ? "vercel"
    : "cloudflare-module";

export default defineConfig({
  nitro: {
    preset: nitroPreset,
    routeRules: {
      "/_serverFn/**": {
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
