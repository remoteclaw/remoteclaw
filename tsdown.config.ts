import { existsSync, readFileSync } from "node:fs";
import { defineConfig } from "tsdown";

const env = {
  NODE_ENV: "production",
};
const OUTPUT_SOURCE_MAPS = process.env.OUTPUT_SOURCE_MAPS === "1";

function buildInputOptions(options: { onLog?: unknown; [key: string]: unknown }) {
  if (process.env.REMOTECLAW_BUILD_VERBOSE === "1") {
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
    sourcemap: OUTPUT_SOURCE_MAPS,
    inputOptions: buildInputOptions,
  };
}

// Single source of truth for the plugin-sdk build set: the package.json `exports`
// map. `src/plugin-sdk/root-alias.cjs` (buildPluginSdkAliasMap → useDist) resolves
// each advertised `./plugin-sdk/<subpath>` against `dist/plugin-sdk/<subpath>.js`;
// when that file is missing the alias is silently dropped and the plugin import
// falls through to the bare root alias, failing at runtime as
// `Cannot find module '.../dist/plugin-sdk/root-alias.cjs/<subpath>'`. Deriving the
// build set from the same `exports` map root-alias reads (with the same subpath
// regex) keeps build ⇄ exports ⇄ root-alias from silently diverging, so every
// source-backed subpath export is guaranteed a concrete dist file.
//
// The `existsSync` filter drops phantom exports that have no `src/plugin-sdk/*.ts`
// source (so tsdown is never asked to build a nonexistent input). `index` is always
// built as the bare `./plugin-sdk` entry. Paths resolve against the build cwd (repo
// root), matching the relative-path convention used by the entries below.
const rootPackageExports = (
  JSON.parse(readFileSync("package.json", "utf8")) as {
    exports?: Record<string, unknown>;
  }
).exports;

const exportedPluginSdkEntrypoints = Object.keys(rootPackageExports ?? {})
  .filter((key) => key.startsWith("./plugin-sdk/"))
  .map((key) => key.slice("./plugin-sdk/".length))
  .filter((subpath) => /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(subpath))
  .filter((subpath) => existsSync(`src/plugin-sdk/${subpath}.ts`));

const pluginSdkEntrypoints = [...new Set(["index", ...exportedPluginSdkEntrypoints])];

export default defineConfig([
  nodeBuildConfig({
    entry: "src/index.ts",
  }),
  nodeBuildConfig({
    entry: "src/entry.ts",
  }),
  nodeBuildConfig({
    // Ensure this module is bundled as an entry so legacy CLI shims can resolve its exports.
    entry: "src/cli/daemon-cli.ts",
  }),
  nodeBuildConfig({
    entry: "src/infra/warning-filter.ts",
  }),
  nodeBuildConfig({
    // Keep sync lazy-runtime channel modules as concrete dist files.
    entry: {
      "channels/plugins/agent-tools/whatsapp-login":
        "src/channels/plugins/agent-tools/whatsapp-login.ts",
      "channels/plugins/actions/discord": "src/channels/plugins/actions/discord.ts",
      "channels/plugins/actions/signal": "src/channels/plugins/actions/signal.ts",
      "channels/plugins/actions/telegram": "src/channels/plugins/actions/telegram.ts",
      "telegram/audit": "extensions/telegram/src/audit.ts",
      "telegram/token": "extensions/telegram/src/token.ts",
      "line/accounts": "src/line/accounts.ts",
      "line/send": "src/line/send.ts",
      "line/template-messages": "src/line/template-messages.ts",
    },
  }),
  ...pluginSdkEntrypoints.map((entry) =>
    nodeBuildConfig({
      entry: `src/plugin-sdk/${entry}.ts`,
      outDir: "dist/plugin-sdk",
    }),
  ),
  nodeBuildConfig({
    entry: "src/extensionAPI.ts",
  }),
  nodeBuildConfig({
    entry: ["src/hooks/bundled/*/handler.ts", "src/hooks/slug-generator.ts"],
  }),
]);
