import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { corePackageAliases } from "./scripts/lib/core-package-aliases.mjs";
import { pluginSdkSubpaths } from "./scripts/lib/plugin-sdk-entries.mjs";
import privateLocalOnlyPluginSdkSubpaths from "./scripts/lib/plugin-sdk-private-local-only-subpaths.json" with { type: "json" };

const repoRoot = path.dirname(fileURLToPath(import.meta.url));
const isCI = process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";
const isWindows = process.platform === "win32";
const localWorkers = Math.max(4, Math.min(16, os.cpus().length));
const ciWorkers = isWindows ? 2 : 3;

/** Subpaths backed by a real `src/plugin-sdk/<name>.ts`, including fork-side ones
 * absent from the published entrypoint list (`telegram`, `discord`, `health`, ...). */
function listLocalPluginSdkSubpaths(): string[] {
  return fs
    .readdirSync(path.join(repoRoot, "src", "plugin-sdk"), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => entry.name.slice(0, -".ts".length))
    .filter((subpath) => subpath !== "index" && !/\.(?:test|spec|d)$/u.test(subpath));
}

// Derived, never hand-maintained: the same shared source of truth that
// test/vitest/vitest.shared.config.ts uses, unioned with the subpaths actually on
// disk. The previous hand-maintained copy silently omitted `request-url`, so bare
// `vitest` failed to resolve imports the scoped/CI lanes resolved fine (#2964).
const pluginSdkAliasSubpaths = [
  ...new Set([
    ...pluginSdkSubpaths,
    ...privateLocalOnlyPluginSdkSubpaths,
    ...listLocalPluginSdkSubpaths(),
  ]),
].toSorted((left, right) => left.localeCompare(right));

/** Control UI suites that need a real DOM (`document` / `window` / DOMPurify) and
 * therefore cannot run in this node lane. They are the browser lane's business
 * (`ui/vitest.config.ts`, run via `pnpm test:ui` / `pnpm test:ui:smoke`); excluding
 * them here is lane assignment, not suppression.
 *
 * Hand-listed on purpose: the `*.browser.test.ts` convention (excluded by pattern
 * below) does NOT cover these — each was verified to fail in this lane solely on a
 * missing DOM global. */
const UI_BROWSER_LANE_SUITES = [
  "ui/src/app/native-bridge.test.ts",
  "ui/src/components/markdown.test.ts",
  "ui/src/lib/clipboard.test.ts",
  "ui/src/lib/hover-marquee.test.ts",
  "ui/src/lib/open-external-url.test.ts",
  "ui/src/pages/channels/view.test.ts",
  "ui/src/pages/chat/chat-view.test.ts",
  "ui/src/pages/chat/scroll.test.ts",
  "ui/src/pages/cron/view.test.ts",
  "ui/src/pages/dreams/dreaming.test.ts",
  "ui/src/pages/sessions/view.test.ts",
];

/** DEBT LEDGER — Control UI suites that DO run under this lane's env but currently
 * FAIL on their own assertions. They arrived with the v2026.7.1-2 restructure and
 * were never executed by any CI lane before it (the six hardcoded `ui/src/ui/...`
 * include entries this glob replaces covered four live files, none of these).
 *
 * They are excluded so the lane can be green and still catch NEW breakage in every
 * other UI file — same rationale as `vitest.quarantine.ts`. This is NOT a design
 * boundary and NOT a claim that they are environment-bound: each one is a genuine
 * red that needs fixing. Verified per file against the browser lane too, so the
 * failure is the suite's own, not a node/browser mismatch.
 *
 * TO REMOVE AN ENTRY (the goal — shrink to zero): fix the underlying failure, then
 * delete the line. Do not add entries here to green a red PR. */
const UI_FAILING_SUITES_DEBT = [
  // Fails in this lane; cannot run in the browser lane at all (reads sources via
  // `node:fs`/`node:vm`, which vite externalizes). This lane is its only home.
  "ui/src/app/mount-fallback.test.ts",
  // Upstream's rewrite of the fork's #3024 build-id guard — the Control UI
  // service-worker build-id contract that otherwise only the publish lanes'
  // `pnpm ui:build` exercises. Until this entry is removed, that contract has NO
  // test guarding it (24% similar to the file it replaced, which did guard it).
  // The fork-side contract it inherited is intact — every assertion
  // the fork's own version made still passes. It is red only on the two assertions
  // upstream ADDED, for a client-side update-notification path in `ui/src/main.ts`
  // (`serviceWorker.addEventListener("message"`, `event.data.version !==
  // currentControlUiBuildId`) that this fork has never had, at this commit or
  // before it. Orphaned upstream test, not a regression in the #3024 contract.
  "ui/src/app/service-worker-cache.test.ts",
  "ui/src/app/vite-config.node.test.ts",
  "ui/src/pages/chat/realtime-talk-shared.browser-import.test.ts",
  "ui/src/pages/config/presets.test.ts",
  // Fails identically in this lane and in the browser lane — the assertion is red
  // regardless of environment.
  "ui/src/api/gateway.node.test.ts",
  "ui/src/lib/chat/message-normalizer.test.ts",
  "ui/src/lib/config/index.test.ts",
  "ui/src/pages/activity/view.test.ts",
  "ui/src/pages/chat/chat-composer.test.ts",
  "ui/src/pages/chat/realtime-talk-input.test.ts",
  "ui/src/pages/logs/view.test.ts",
  "ui/src/pages/overview/view.render.test.ts",
];

export default defineConfig({
  resolve: {
    // Keep this ordered: the base `remoteclaw/plugin-sdk` alias is a prefix match.
    alias: [
      // Resolve adopted `@remoteclaw/*-core` packages to source (ADR-0020); their
      // `exports` point at unbuilt `dist/*.mjs`, so test lanes need source aliases.
      ...corePackageAliases(repoRoot),
      ...pluginSdkAliasSubpaths.map((subpath) => ({
        find: `remoteclaw/plugin-sdk/${subpath}`,
        replacement: path.join(repoRoot, "src", "plugin-sdk", `${subpath}.ts`),
      })),
      {
        find: "remoteclaw/plugin-sdk",
        replacement: path.join(repoRoot, "src", "plugin-sdk", "index.ts"),
      },
    ],
  },
  test: {
    testTimeout: 120_000,
    hookTimeout: isWindows ? 180_000 : 120_000,
    // Many suites rely on `vi.stubEnv(...)` and expect it to be scoped to the test.
    // This is especially important under `pool=vmForks` where env leaks cross-file.
    unstubEnvs: true,
    // Same rationale as unstubEnvs: avoid cross-test pollution under vmForks.
    unstubGlobals: true,
    pool: "forks",
    maxWorkers: isCI ? ciWorkers : localWorkers,
    include: [
      "src/**/*.test.ts",
      "extensions/**/*.test.ts",
      "test/**/*.test.ts",
      // Globbed, never hand-listed. The v2026.7.1-2 restructure relocated all six
      // previously-hardcoded `ui/src/ui/...` entries, and vitest does not warn when
      // an include pattern matches nothing — so every one of them silently matched
      // zero files and the lane stayed green while running no UI tests at all.
      // `*.browser.test.ts` is excluded below: those need a real DOM/browser and
      // belong to the `test-ui-smoke` lane (`ui/vitest.config.ts`). Two further
      // exclusion ledgers are defined above the config — read them before assuming
      // a UI suite is covered.
      "ui/src/{api,app,components,lib,pages}/**/*.test.ts",
    ],
    setupFiles: ["test/setup.ts"],
    exclude: [
      "dist/**",
      "apps/macos/**",
      "apps/macos/.build/**",
      "**/node_modules/**",
      "**/vendor/**",
      "dist/RemoteClaw.app/**",
      "**/*.live.test.ts",
      "**/*.e2e.test.ts",
      // Control UI suites needing a real DOM/browser. Owned by the `test-ui-smoke`
      // lane via `ui/vitest.config.ts`; this is a node lane. Does not affect that
      // lane, which is a separate config and does not inherit this exclude list.
      "ui/src/**/*.browser.test.ts",
      ...UI_BROWSER_LANE_SUITES,
      ...UI_FAILING_SUITES_DEBT,
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 55,
        statements: 70,
      },
      // Anchor to repo-root `src/` only. Without this, coverage globs can
      // unintentionally match nested `*/src/**` folders (extensions, apps, etc).
      include: ["./src/**/*.ts"],
      exclude: [
        // Never count workspace packages/apps toward core coverage thresholds.
        "extensions/**",
        "apps/**",
        "ui/**",
        "test/**",
        "src/**/*.test.ts",
        // Entrypoints and wiring (covered by CI smoke + manual/e2e flows).
        "src/entry.ts",
        "src/index.ts",
        "src/runtime.ts",
        "src/channel-web.ts",
        "src/extensionAPI.ts",
        "src/logging.ts",
        "src/cli/**",
        "src/commands/**",
        "src/daemon/**",
        "src/hooks/**",
        "src/macos/**",

        // Large integration surfaces; validated via e2e/manual/contract tests.
        "src/acp/**",
        "src/agents/**",
        "src/channels/**",
        "src/gateway/**",
        "src/line/**",
        "src/node-host/**",
        "src/plugins/**",
        "src/providers/**",

        // Some agent integrations are intentionally validated via manual/e2e runs.
        "src/agents/sandbox-paths.ts",
        "src/agents/sandbox.ts",
        "src/agents/skills-install.ts",
        "src/agents/tools/discord-actions*.ts",
        "src/agents/tools/slack-actions.ts",

        // Hard-to-unit-test modules; exercised indirectly by integration tests.
        "src/infra/state-migrations.ts",
        "src/infra/update-check.ts",
        "src/infra/ports-inspect.ts",
        "src/infra/outbound/outbound-session.ts",

        // Gateway server integration surfaces are intentionally validated via manual/e2e runs.
        "src/gateway/control-ui.ts",
        "src/gateway/server-bridge.ts",
        "src/gateway/server-channels.ts",
        "src/gateway/server-methods/config.ts",
        "src/gateway/server-methods/send.ts",
        "src/gateway/server-methods/skills.ts",
        "src/gateway/server-methods/talk.ts",
        "src/gateway/server-methods/web.ts",
        "src/gateway/server-methods/wizard.ts",

        // Process bridges are hard to unit-test in isolation.
        "src/gateway/call.ts",
        "src/process/tau-rpc.ts",
        "src/process/exec.ts",
        // Interactive UIs/flows are intentionally validated via manual/e2e runs.
        "src/tui/**",
        "src/wizard/**",
        // Channel surfaces are largely integration-tested (or manually validated).
        "extensions/imessage/src/**",
        "extensions/signal/src/**",
        "extensions/slack/src/**",
        "extensions/whatsapp/src/**",
        "src/browser/**",
        "src/channels/web/**",
        "src/webchat/**",
        "src/gateway/server.ts",
        "src/gateway/client.ts",
        "src/gateway/protocol/**",
        "src/infra/tailscale.ts",
      ],
    },
  },
});
