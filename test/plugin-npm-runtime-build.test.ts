import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  listPublishablePluginPackageDirs,
  resolvePluginNpmRuntimeBuildPlan,
} from "../scripts/lib/plugin-npm-runtime-build.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");

describe("plugin npm runtime build planning", () => {
  it("plans package-local runtime entries for every publishable plugin package", () => {
    const packageDirs = listPublishablePluginPackageDirs({ repoRoot });
    expect(packageDirs.length).toBeGreaterThan(0);

    const plans = packageDirs.map((packageDir) =>
      resolvePluginNpmRuntimeBuildPlan({
        repoRoot,
        packageDir,
      }),
    );
    expect(plans.filter(Boolean).map((plan) => plan?.pluginDir)).toEqual(
      packageDirs.map((packageDir) => path.basename(packageDir)),
    );
    for (const plan of plans) {
      expect(plan?.outDir).toBe(path.join(plan?.packageDir ?? "", "dist"));
      expect(plan?.runtimeExtensions.every((entry) => entry.startsWith("./dist/"))).toBe(true);
      expect(plan?.runtimeBuildOutputs.every((entry) => entry.startsWith("./dist/"))).toBe(true);
      expect(plan?.packageFiles).toContain("dist/**");
      expect(plan?.packagePeerMetadata.peerDependencies.remoteclaw).toBe(
        plan?.packageJson.remoteclaw.compat.pluginApi,
      );
      expect(plan?.packagePeerMetadata.peerDependenciesMeta.remoteclaw.optional).toBe(true);
    }
  });
});
