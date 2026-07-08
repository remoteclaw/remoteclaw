import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  listPublishablePluginPackageDirs,
  resolvePluginNpmRuntimeBuildPlan,
} from "../scripts/lib/plugin-npm-runtime-build.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");

type PluginNpmRuntimeBuildPlan = NonNullable<ReturnType<typeof resolvePluginNpmRuntimeBuildPlan>>;

function expectDistRelativePaths(paths: string[]) {
  expect(paths.every((entry) => entry.startsWith("./dist/"))).toBe(true);
}

function expectPluginNpmRuntimeBuildPlan(
  plan: ReturnType<typeof resolvePluginNpmRuntimeBuildPlan>,
): PluginNpmRuntimeBuildPlan {
  if (!plan) {
    throw new Error("expected plugin npm runtime build plan");
  }
  return plan;
}

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
    const resolvedPlans = plans.map(expectPluginNpmRuntimeBuildPlan);
    expect(resolvedPlans.map((plan) => plan.pluginDir)).toEqual(
      packageDirs.map((packageDir) => path.basename(packageDir)),
    );
    for (const plan of resolvedPlans) {
      expect(plan.outDir).toBe(path.join(plan.packageDir, "dist"));
      expectDistRelativePaths(plan.runtimeExtensions);
      expectDistRelativePaths(plan.runtimeBuildOutputs);
      expect(plan.packageFiles).toContain("dist/**");
      expect(plan.packagePeerMetadata.peerDependencies.remoteclaw).toBe(
        plan.packageJson.remoteclaw.compat.pluginApi,
      );
      expect(plan.packagePeerMetadata.peerDependenciesMeta.remoteclaw.optional).toBe(true);
    }
  });
});
