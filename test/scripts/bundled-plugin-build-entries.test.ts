import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { collectBundledPluginBuildEntries } from "../../scripts/lib/bundled-plugin-build-entries.mjs";

// Guards the manifest-only case: a bundled-plugin dir that carries a
// remoteclaw.plugin.json (config-schema declaration) but has NO runtime
// entrypoint (no index.ts, no package.json entries) — e.g. active-memory —
// must NOT synthesize a phantom ./index.ts build entry pointing at a file that
// does not exist. See #2765.

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const MANIFEST = JSON.stringify({
  id: "fixture",
  configSchema: { type: "object", additionalProperties: false, properties: {} },
});

// Builds a throwaway repo root whose extensions/<id>/ dirs carry the given files.
function makeExtensionsRoot(plugins: Record<string, Record<string, string>>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "remoteclaw-bundled-entries-"));
  tempDirs.push(dir);
  for (const [id, files] of Object.entries(plugins)) {
    const pluginDir = path.join(dir, "extensions", id);
    fs.mkdirSync(pluginDir, { recursive: true });
    for (const [rel, contents] of Object.entries(files)) {
      fs.writeFileSync(path.join(pluginDir, rel), contents);
    }
  }
  return dir;
}

describe("collectBundledPluginBuildEntries manifest-only handling", () => {
  it("does not synthesize a phantom ./index.ts for a manifest-only plugin", () => {
    const cwd = makeExtensionsRoot({
      "manifest-only": { "remoteclaw.plugin.json": MANIFEST },
    });
    const entries = collectBundledPluginBuildEntries({ cwd, env: {} });
    const entry = entries.find((e) => e.id === "manifest-only");

    expect(entry).toBeDefined();
    expect(entry?.hasManifest).toBe(true);
    // The fix: no runtime entrypoint on disk → no build entries (was ["./index.ts"]).
    expect(entry?.sourceEntries).toEqual([]);
  });

  it("still resolves ./index.ts when the entrypoint actually exists", () => {
    const cwd = makeExtensionsRoot({
      "with-index": { "remoteclaw.plugin.json": MANIFEST, "index.ts": "export {};\n" },
    });
    const entries = collectBundledPluginBuildEntries({ cwd, env: {} });
    const entry = entries.find((e) => e.id === "with-index");

    expect(entry).toBeDefined();
    expect(entry?.sourceEntries).toContain("./index.ts");
  });
});
