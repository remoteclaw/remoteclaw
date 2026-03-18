import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  findBundledPluginSource,
  findBundledPluginSourceInMap,
  resolveBundledPluginSources,
} from "./bundled-sources.js";

const discoverRemoteClawPluginsMock = vi.fn();
const loadPluginManifestMock = vi.fn();

vi.mock("./discovery.js", () => ({
  discoverRemoteClawPlugins: (...args: unknown[]) => discoverRemoteClawPluginsMock(...args),
}));

vi.mock("./manifest.js", () => ({
  loadPluginManifest: (...args: unknown[]) => loadPluginManifestMock(...args),
}));

describe("bundled plugin sources", () => {
  beforeEach(() => {
    discoverRemoteClawPluginsMock.mockReset();
    loadPluginManifestMock.mockReset();
  });

  it("resolves bundled sources keyed by plugin id", () => {
    discoverRemoteClawPluginsMock.mockReturnValue({
      candidates: [
        {
          origin: "global",
          rootDir: "/global/feishu",
          packageName: "@remoteclaw/feishu",
          packageManifest: { install: { npmSpec: "@remoteclaw/feishu" } },
        },
        {
          origin: "bundled",
          rootDir: "/app/extensions/feishu",
          packageName: "@remoteclaw/feishu",
          packageManifest: { install: { npmSpec: "@remoteclaw/feishu" } },
        },
        {
          origin: "bundled",
          rootDir: "/app/extensions/feishu-dup",
          packageName: "@remoteclaw/feishu",
          packageManifest: { install: { npmSpec: "@remoteclaw/feishu" } },
        },
        {
          origin: "bundled",
          rootDir: "/app/extensions/msteams",
          packageName: "@remoteclaw/msteams",
          packageManifest: { install: { npmSpec: "@remoteclaw/msteams" } },
        },
      ],
      diagnostics: [],
    });

    loadPluginManifestMock.mockImplementation((rootDir: string) => {
      if (rootDir === "/app/extensions/feishu") {
        return { ok: true, manifest: { id: "feishu" } };
      }
      if (rootDir === "/app/extensions/msteams") {
        return { ok: true, manifest: { id: "msteams" } };
      }
      return {
        ok: false,
        error: "invalid manifest",
        manifestPath: `${rootDir}/remoteclaw.plugin.json`,
      };
    });

    const map = resolveBundledPluginSources({});

    expect(Array.from(map.keys())).toEqual(["feishu", "msteams"]);
    expect(map.get("feishu")).toEqual({
      pluginId: "feishu",
      localPath: "/app/extensions/feishu",
      npmSpec: "@remoteclaw/feishu",
    });
  });

  it("finds bundled source by npm spec", () => {
    discoverRemoteClawPluginsMock.mockReturnValue({
      candidates: [
        {
          origin: "bundled",
          rootDir: "/app/extensions/feishu",
          packageName: "@remoteclaw/feishu",
          packageManifest: { install: { npmSpec: "@remoteclaw/feishu" } },
        },
      ],
      diagnostics: [],
    });
    loadPluginManifestMock.mockReturnValue({ ok: true, manifest: { id: "feishu" } });

    const resolved = findBundledPluginSource({
      lookup: { kind: "npmSpec", value: "@remoteclaw/feishu" },
    });
    const missing = findBundledPluginSource({
      lookup: { kind: "npmSpec", value: "@remoteclaw/not-found" },
    });

    expect(resolved?.pluginId).toBe("feishu");
    expect(resolved?.localPath).toBe("/app/extensions/feishu");
    expect(missing).toBeUndefined();
  });

  it("reuses a pre-resolved bundled map for repeated lookups", () => {
    const bundled = new Map([
      [
        "feishu",
        {
          pluginId: "feishu",
          localPath: "/app/extensions/feishu",
          npmSpec: "@remoteclaw/feishu",
        },
      ],
    ]);

    expect(
      findBundledPluginSourceInMap({
        bundled,
        lookup: { kind: "pluginId", value: "feishu" },
      }),
    ).toEqual({
      pluginId: "feishu",
      localPath: "/app/extensions/feishu",
      npmSpec: "@remoteclaw/feishu",
    });
    expect(
      findBundledPluginSourceInMap({
        bundled,
        lookup: { kind: "npmSpec", value: "@remoteclaw/feishu" },
      })?.pluginId,
    ).toBe("feishu");

    discoverRemoteClawPluginsMock.mockReturnValue({
      candidates: [
        {
          origin: "bundled",
          rootDir: "/app/extensions/diffs",
          packageName: "@remoteclaw/diffs",
          packageManifest: { install: { npmSpec: "@remoteclaw/diffs" } },
        },
      ],
      diagnostics: [],
    });
    loadPluginManifestMock.mockReturnValue({ ok: true, manifest: { id: "diffs" } });

    const resolved = findBundledPluginSource({
      lookup: { kind: "pluginId", value: "diffs" },
    });
    const missing = findBundledPluginSource({
      lookup: { kind: "pluginId", value: "not-found" },
    });

    expect(resolved?.pluginId).toBe("diffs");
    expect(resolved?.localPath).toBe("/app/extensions/diffs");
    expect(missing).toBeUndefined();
  });
});
