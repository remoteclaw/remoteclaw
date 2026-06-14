import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanupTrackedTempDirs, makeTrackedTempDir } from "./test-helpers/fs-fixtures.js";

type StageRuntimeDepsInstallParams = {
  packageJson: Record<string, unknown>;
};

type StageBundledPluginRuntimeDeps = (params?: {
  cwd?: string;
  repoRoot?: string;
  installAttempts?: number;
  installPluginRuntimeDepsImpl?: (params: StageRuntimeDepsInstallParams) => void;
}) => void;

type BaileysHotfixParams = {
  chmodSync?: (path: string, mode: number) => void;
  packageRoot?: string;
  createTempPath?: (targetPath: string) => string;
  writeFileSync?: (pathOrFd: string | number, value: string, encoding?: string) => void;
};

type BaileysHotfixResult = {
  applied: boolean;
  reason: string;
  targetPath?: string;
  error?: string;
};

type PostinstallBundledPluginsModule = {
  applyBaileysEncryptedStreamFinishHotfix: (params?: BaileysHotfixParams) => BaileysHotfixResult;
};

async function loadStageBundledPluginRuntimeDeps(): Promise<StageBundledPluginRuntimeDeps> {
  const moduleUrl = new URL("../../scripts/stage-bundled-plugin-runtime-deps.mjs", import.meta.url);
  const loaded = (await import(moduleUrl.href)) as {
    stageBundledPluginRuntimeDeps: StageBundledPluginRuntimeDeps;
  };
  return loaded.stageBundledPluginRuntimeDeps;
}

const tempDirs: string[] = [];

function makeRepoRoot(prefix: string): string {
  return makeTrackedTempDir(prefix, tempDirs);
}

function writeRepoFile(repoRoot: string, relativePath: string, value: string) {
  const fullPath = path.join(repoRoot, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, value, "utf8");
}

afterEach(() => {
  cleanupTrackedTempDirs(tempDirs);
});

describe("stageBundledPluginRuntimeDeps", () => {
  it("drops Lark SDK type cargo while keeping runtime entrypoints", () => {
    const repoRoot = makeRepoRoot("remoteclaw-stage-bundled-runtime-deps-");

    writeRepoFile(
      repoRoot,
      "dist/extensions/feishu/package.json",
      JSON.stringify(
        {
          name: "@remoteclaw/feishu",
          version: "2026.4.10",
          dependencies: {
            "@larksuiteoapi/node-sdk": "^1.60.0",
          },
          remoteclaw: {
            bundle: {
              stageRuntimeDependencies: true,
            },
          },
        },
        null,
        2,
      ),
    );

    writeRepoFile(
      repoRoot,
      "node_modules/@larksuiteoapi/node-sdk/package.json",
      JSON.stringify(
        {
          name: "@larksuiteoapi/node-sdk",
          version: "1.60.0",
          main: "./lib/index.js",
          module: "./es/index.js",
          types: "./types",
        },
        null,
        2,
      ),
    );
    writeRepoFile(
      repoRoot,
      "node_modules/@larksuiteoapi/node-sdk/lib/index.js",
      "export const runtime = true;\n",
    );
    writeRepoFile(
      repoRoot,
      "node_modules/@larksuiteoapi/node-sdk/es/index.js",
      "export const moduleRuntime = true;\n",
    );
    writeRepoFile(
      repoRoot,
      "node_modules/@larksuiteoapi/node-sdk/types/index.d.ts",
      "export interface HugeTypeSurface {}\n",
    );

    return loadStageBundledPluginRuntimeDeps().then((stageBundledPluginRuntimeDeps) => {
      stageBundledPluginRuntimeDeps({ repoRoot });

      const stagedRoot = path.join(
        repoRoot,
        "dist",
        "extensions",
        "feishu",
        "node_modules",
        "@larksuiteoapi",
        "node-sdk",
      );
      expect(fs.existsSync(path.join(stagedRoot, "lib", "index.js"))).toBe(true);
      expect(fs.existsSync(path.join(stagedRoot, "es", "index.js"))).toBe(true);
      expect(fs.existsSync(path.join(stagedRoot, "types"))).toBe(false);
    });
  });

  it("strips non-runtime dependency sections before temp npm staging", async () => {
    const repoRoot = makeRepoRoot("remoteclaw-stage-bundled-runtime-manifest-");
    writeRepoFile(
      repoRoot,
      "dist/extensions/amazon-bedrock/package.json",
      JSON.stringify(
        {
          name: "@remoteclaw/amazon-bedrock-provider",
          version: "2026.4.10",
          dependencies: {
            "@aws-sdk/client-bedrock": "3.1024.0",
          },
          devDependencies: {
            "@remoteclaw/plugin-sdk": "workspace:*",
          },
          peerDependencies: {
            remoteclaw: "^0.0.0",
          },
          peerDependenciesMeta: {
            remoteclaw: {
              optional: true,
            },
          },
          remoteclaw: {
            bundle: {
              stageRuntimeDependencies: true,
            },
          },
        },
        null,
        2,
      ),
    );

    const stageBundledPluginRuntimeDeps = await loadStageBundledPluginRuntimeDeps();
    const installs: Array<Record<string, unknown>> = [];
    stageBundledPluginRuntimeDeps({
      repoRoot,
      installAttempts: 1,
      installPluginRuntimeDepsImpl(params: { packageJson: Record<string, unknown> }) {
        installs.push(params.packageJson);
      },
    });

    expect(installs).toHaveLength(1);
    expect(installs[0]?.dependencies).toEqual({
      "@aws-sdk/client-bedrock": "3.1024.0",
    });
    expect(installs[0]?.devDependencies).toBeUndefined();
    expect(installs[0]?.peerDependencies).toBeUndefined();
    expect(installs[0]?.peerDependenciesMeta).toBeUndefined();
  });
});
