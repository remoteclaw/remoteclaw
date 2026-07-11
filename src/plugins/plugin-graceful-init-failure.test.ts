import fs from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { cleanupTrackedTempDirs, makeTrackedTempDir } from "./test-helpers/fs-fixtures.js";

const fixtureTempDirs: string[] = [];
const fixtureRoot = makeTrackedTempDir("remoteclaw-plugin-graceful", fixtureTempDirs);
let tempDirIndex = 0;

afterAll(() => {
  cleanupTrackedTempDirs(fixtureTempDirs);
});

function makeTempDir() {
  const dir = path.join(fixtureRoot, `case-${tempDirIndex++}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writePlugin(params: { id: string; body: string; dir?: string }): {
  id: string;
  file: string;
  dir: string;
} {
  const dir = params.dir ?? makeTempDir();
  fs.mkdirSync(dir, { recursive: true });
  const filename = `${params.id}.cjs`;
  const file = path.join(dir, filename);
  fs.writeFileSync(file, params.body, "utf-8");
  fs.writeFileSync(
    path.join(dir, "remoteclaw.plugin.json"),
    JSON.stringify({
      id: params.id,
      name: params.id,
      version: "1.0.0",
      main: filename,
      configSchema: { type: "object" },
    }),
    "utf-8",
  );
  return { id: params.id, file, dir };
}

function readPluginId(pluginPath: string): string {
  const manifestPath = path.join(path.dirname(pluginPath), "remoteclaw.plugin.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as { id: string };
  return manifest.id;
}

async function loadPlugins(pluginPaths: string[], warnings?: string[]) {
  const { loadRemoteClawPlugins } = await import("./loader.js");
  const { clearPluginDiscoveryCache } = await import("./discovery.js");
  clearPluginDiscoveryCache();
  const allow = pluginPaths.map((pluginPath) => readPluginId(pluginPath));
  return loadRemoteClawPlugins({
    cache: false,
    config: {
      plugins: {
        enabled: true,
        load: { paths: pluginPaths },
        allow,
      },
    },
    logger: {
      info: () => {},
      debug: () => {},
      error: () => {},
      warn: (message: string) => warnings?.push(message),
    },
    workspaceDir: fixtureRoot,
  });
}

type LoadedPluginRegistry = Awaited<ReturnType<typeof loadPlugins>>;
type LoadedPluginEntry = LoadedPluginRegistry["plugins"][number];

function requirePluginEntry(registry: LoadedPluginRegistry, pluginId: string): LoadedPluginEntry {
  const entry = registry.plugins.find((plugin) => plugin.id === pluginId);
  if (!entry) {
    throw new Error(`expected ${pluginId} registry entry`);
  }
  return entry;
}

describe("graceful plugin initialization failure", () => {
  it("marks plugin entry errored when register throws", async () => {
    const plugin = writePlugin({
      id: "throws-on-register",
      body: `module.exports = { id: "throws-on-register", register() { throw new Error("config schema mismatch"); } };`,
    });

    const registry = await loadPlugins([plugin.file]);
    expect(requirePluginEntry(registry, "throws-on-register").status).toBe("error");
  });

  it("keeps loading other plugins after one register failure", async () => {
    const failing = writePlugin({
      id: "plugin-fail",
      body: `module.exports = { id: "plugin-fail", register() { throw new Error("boom"); } };`,
    });
    const working = writePlugin({
      id: "plugin-ok",
      body: `module.exports = { id: "plugin-ok", register() {} };`,
    });

    const registry = await loadPlugins([failing.file, working.file]);

    expect(registry.plugins.find((plugin) => plugin.id === "plugin-ok")?.status).toBe("loaded");
  });

  it("records failed register metadata", async () => {
    const plugin = writePlugin({
      id: "register-error",
      body: `module.exports = { id: "register-error", register() { throw new Error("brutal config fail"); } };`,
    });

    const registry = await loadPlugins([plugin.file]);

    const failed = requirePluginEntry(registry, "register-error");
    expect(failed.status).toBe("error");
    expect(failed.error).toContain("brutal config fail");
  });

  it("records validation failures before register", async () => {
    const plugin = writePlugin({
      id: "missing-register",
      body: `module.exports = { id: "missing-register" };`,
    });

    const registry = await loadPlugins([plugin.file]);
    const failed = registry.plugins.find((entry) => entry.id === "missing-register");

    expect(failed?.status).toBe("error");
    expect(failed?.error).toBe("plugin export missing register/activate");
  });
});
