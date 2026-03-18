import { defineConfig } from "tsdown";

const env = {
  NODE_ENV: "production",
};

function buildInputOptions(options: { onLog?: unknown; [key: string]: unknown }) {
  if (process.env.OPENCLAW_BUILD_VERBOSE === "1") {
    return undefined;
  }

  const previousOnLog = typeof options.onLog === "function" ? options.onLog : undefined;

  return {
    ...options,
    onLog(
      level: string,
      log: { code?: string },
      defaultHandler: (level: string, log: { code?: string }) => void,
    ) {
      if (log.code === "PLUGIN_TIMINGS") {
        return;
      }
      if (typeof previousOnLog === "function") {
        previousOnLog(level, log, defaultHandler);
        return;
      }
      defaultHandler(level, log);
    },
  };
}

function nodeBuildConfig(config: Record<string, unknown>) {
  return {
    ...config,
    env,
    fixedExtension: false,
    platform: "node",
    inputOptions: buildInputOptions,
  };
}

const pluginSdkEntrypoints = [
  "index",
  "core",
  "compat",
  "telegram",
  "discord",
  "slack",
  "signal",
  "imessage",
  "whatsapp",
  "line",
  "msteams",
  "acpx",
  "bluebubbles",
  "copilot-proxy",
  "device-pair",
  "diagnostics-otel",
  "diffs",
  "feishu",
  "google-gemini-cli-auth",
  "googlechat",
  "irc",
  "llm-task",
  "lobster",
  "matrix",
  "mattermost",
  "minimax-portal-auth",
  "nextcloud-talk",
  "nostr",
  "open-prose",
  "phone-control",
  "qwen-portal-auth",
  "synology-chat",
  "talk-voice",
  "test-utils",
  "thread-ownership",
  "tlon",
  "twitch",
  "voice-call",
  "zalo",
  "zalouser",
  "account-id",
  "keyed-async-queue",
] as const;

function buildCoreDistEntries(): Record<string, string> {
  return {
    index: "src/index.ts",
    entry: "src/entry.ts",
    // Ensure this module is bundled as an entry so legacy CLI shims can resolve its exports.
    "cli/daemon-cli": "src/cli/daemon-cli.ts",
    "infra/warning-filter": "src/infra/warning-filter.ts",
    extensionAPI: "src/extensionAPI.ts",
    // Keep sync lazy-runtime channel modules as concrete dist files.
    "telegram/audit": "src/telegram/audit.ts",
    "telegram/token": "src/telegram/token.ts",
    "line/accounts": "src/line/accounts.ts",
    "line/send": "src/line/send.ts",
    "line/template-messages": "src/line/template-messages.ts",
  };
}

const coreDistEntries = buildCoreDistEntries();

export default defineConfig([
  nodeBuildConfig({
    // Build the root dist entrypoints together so they can share hashed chunks
    // instead of emitting near-identical copies across separate builds.
    entry: coreDistEntries,
  }),
  ...pluginSdkEntrypoints.map((entry) =>
    nodeBuildConfig({
      entry: `src/plugin-sdk/${entry}.ts`,
      outDir: "dist/plugin-sdk",
    }),
  ),
  nodeBuildConfig({
    entry: ["src/hooks/bundled/*/handler.ts", "src/hooks/llm-slug-generator.ts"],
  }),
]);
