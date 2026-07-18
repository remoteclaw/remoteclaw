import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Pre-bundle the UI's own runtime deps up front. Vite's dep scanner crawls the
  // whole pnpm workspace — including extensions/* whose `remoteclaw/plugin-sdk/*`
  // imports don't resolve from the ui/ context — so the scan throws, auto
  // pre-bundling is skipped, and vite instead discovers these deps mid-run and
  // reloads the test ("Vite unexpectedly reloaded a test"), which deterministically
  // fails on a cold cache (i.e. every CI run). An explicit include list is honored
  // regardless of the scan failure, so the deps are optimized before the run starts.
  optimizeDeps: {
    include: [
      "lit",
      "lit/decorators.js",
      "lit/directives/if-defined.js",
      "lit/directives/ref.js",
      "lit/directives/repeat.js",
      "lit/directives/unsafe-html.js",
      "markdown-it",
      "markdown-it-task-lists",
      "dompurify",
      "json5",
      "@noble/ed25519",
      "highlight.js/lib/core",
      "highlight.js/lib/languages/bash",
      "highlight.js/lib/languages/cpp",
      "highlight.js/lib/languages/css",
      "highlight.js/lib/languages/diff",
      "highlight.js/lib/languages/go",
      "highlight.js/lib/languages/java",
      "highlight.js/lib/languages/javascript",
      "highlight.js/lib/languages/json",
      "highlight.js/lib/languages/markdown",
      "highlight.js/lib/languages/python",
      "highlight.js/lib/languages/rust",
      "highlight.js/lib/languages/typescript",
      "highlight.js/lib/languages/xml",
      "highlight.js/lib/languages/yaml",
    ],
  },
  test: {
    include: ["src/**/*.test.ts"],
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [{ browser: "chromium", name: "chromium" }],
      headless: true,
      ui: false,
    },
  },
});
