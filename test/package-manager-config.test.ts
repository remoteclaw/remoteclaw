import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import {
  collectCurrentShrinkwrapOverrides,
  collectPnpmLockViolations,
  exactVersionFromOverrideSpec,
  mergeOverrides,
  parsePnpmPackageKey,
  readShrinkwrapOverrides,
} from "../scripts/generate-npm-shrinkwrap.mjs";

type PnpmBuildConfig = {
  allowBuilds?: Record<string, boolean>;
  blockExoticSubdeps?: boolean;
  ignoredBuiltDependencies?: string[];
  onlyBuiltDependencies?: string[];
};

type RootPackageJson = {
  pnpm?: PnpmBuildConfig;
};

type WorkspaceConfig = PnpmBuildConfig;
type NpmShrinkwrap = {
  name?: string;
  version?: string;
  packages?: Record<string, { name?: string; version?: string; dev?: boolean }>;
};

function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
}

function collectPnpmLockPackages(): Set<string> {
  const lockfile = parse(fs.readFileSync("pnpm-lock.yaml", "utf8")) as {
    packages?: Record<string, { version?: unknown }>;
  };
  const packages = new Set<string>();
  for (const [packageKey, metadata] of Object.entries(lockfile.packages ?? {})) {
    const parsed = parsePnpmPackageKey(packageKey);
    if (!parsed) {
      continue;
    }
    packages.add(`${parsed.name}@${parsed.version}`);
    if (typeof metadata.version === "string") {
      packages.add(`${parsed.name}@${metadata.version}`);
    }
  }
  return packages;
}

describe("package manager build policy", () => {
  it("keeps optional native Discord opus builds disabled by default", () => {
    const packageJson = readJson("package.json") as RootPackageJson;
    const workspace = parse(fs.readFileSync("pnpm-workspace.yaml", "utf8")) as WorkspaceConfig;

    // The fork keeps its pnpm build policy in package.json and gates native builds through an
    // onlyBuiltDependencies allowlist. It did not adopt upstream's pnpm-workspace.yaml
    // allowBuilds/blockExoticSubdeps migration, so @discordjs/opus stays disabled by being absent
    // from the allowlist rather than by an explicit allowBuilds:false entry.
    expect(packageJson.pnpm).toBeDefined();
    expect(workspace.allowBuilds).toBeUndefined();
    const buildAllowlist = [
      ...(packageJson.pnpm?.onlyBuiltDependencies ?? []),
      ...(workspace.onlyBuiltDependencies ?? []),
    ];
    expect(buildAllowlist.length).toBeGreaterThan(0);
    expect(buildAllowlist).not.toContain("@discordjs/opus");
  });

  it("keeps the fork's pnpm dependency overrides exact-pinned", () => {
    // The fork carries dependency overrides in package.json's pnpm block — it ships no root
    // npm-shrinkwrap.json and no pnpm-workspace.yaml overrides (upstream's model). Every override
    // must still be an exact pin (semver or npm: alias) so installs stay reproducible.
    const packageJson = readJson("package.json") as {
      pnpm?: { overrides?: Record<string, string | number> };
    };
    const overrides = packageJson.pnpm?.overrides ?? {};

    expect(Object.keys(overrides).length).toBeGreaterThan(0);
    for (const [name, spec] of Object.entries(overrides)) {
      expect(exactVersionFromOverrideSpec(String(spec)), `${name}=${String(spec)}`).not.toBeNull();
    }
  });

  it("pins forked transitive dependencies with parent-scoped shrinkwrap overrides", () => {
    const overrides = readShrinkwrapOverrides() as Record<string, unknown>;

    // The fork's pnpm-lock.yaml carries lru-memoizer@2.3.0 (with a forked lru-cache 6.0.0) but not
    // the lru-memoizer@3.0.0 line upstream pins, so only the 2.3.0 parent-scoped override is asserted.
    expect(overrides["lru-cache"]).toBeUndefined();
    expect(overrides["lru-memoizer@2.3.0"]).toMatchObject({
      "lru-cache": { ".": "6.0.0", yallist: "4.0.0" },
    });
  });

  it("can preserve current forked shrinkwrap dependencies with parent-scoped overrides", () => {
    const overrides = collectCurrentShrinkwrapOverrides(
      {
        packages: {
          "": { dependencies: { "current-parent": "1.0.0" } },
          "node_modules/current-parent": {
            version: "1.0.0",
            dependencies: { "forked-child": "^2.0.0" },
          },
          "node_modules/current-parent/node_modules/forked-child": {
            version: "2.0.0",
          },
          "node_modules/legacy-parent": {
            version: "1.0.0",
            dependencies: { "forked-child": "1.0.0" },
          },
          "node_modules/legacy-parent/node_modules/forked-child": {
            version: "1.0.0",
          },
          "node_modules/stable-child": {
            version: "3.0.0",
          },
        },
      },
      new Set(["current-parent"]),
      new Set([
        "current-parent@1.0.0",
        "legacy-parent@1.0.0",
        "forked-child@1.0.0",
        "forked-child@2.0.0",
        "stable-child@3.0.0",
      ]),
    );

    expect(overrides).toEqual({
      "current-parent@1.0.0": { "forked-child": "2.0.0" },
      "legacy-parent": { ".": "1.0.0", "forked-child": "1.0.0" },
      "legacy-parent@1.0.0": { "forked-child": "1.0.0" },
      "stable-child": "3.0.0",
    });
  });

  it("merges exact current shrinkwrap pins with nested lock-derived pins", () => {
    expect(
      mergeOverrides(
        { "@mistralai/mistralai": "2.2.1" },
        { "@mistralai/mistralai": { ".": "2.2.1", zod: "4.4.3" } },
        {},
      ),
    ).toEqual({
      "@mistralai/mistralai": { ".": "2.2.1", zod: "4.4.3" },
    });
  });

  it("preserves npm alias pins when merging nested lock-derived pins", () => {
    expect(
      mergeOverrides(
        { "node-domexception": "npm:@nolyfill/domexception@1.0.28" },
        { "node-domexception": { ".": "1.0.28", child: "2.0.0" } },
        {},
      ),
    ).toEqual({
      "node-domexception": {
        ".": "npm:@nolyfill/domexception@1.0.28",
        child: "2.0.0",
      },
    });
  });

  it("preserves later npm alias pins when nested pins are already merged", () => {
    expect(
      mergeOverrides(
        { "node-domexception": { ".": "1.0.28", child: "2.0.0" } },
        { "node-domexception": "npm:@nolyfill/domexception@1.0.28" },
        {},
      ),
    ).toEqual({
      "node-domexception": {
        ".": "npm:@nolyfill/domexception@1.0.28",
        child: "2.0.0",
      },
    });
  });

  it("rejects non-exact root pins when merging nested pins", () => {
    expect(() =>
      mergeOverrides(
        { "floating-package": "^1.0.0" },
        { "floating-package": { ".": "~1.0.0", child: "2.0.0" } },
        {},
      ),
    ).toThrow(/conflicts with pnpm lock policy/u);
    expect(() =>
      mergeOverrides(
        { "floating-package": { ".": "^1.0.0", child: "2.0.0" } },
        { "floating-package": "~1.0.0" },
        {},
      ),
    ).toThrow(/conflicts with pnpm lock policy/u);
  });

  it("rejects distinct npm alias targets with matching versions", () => {
    expect(() =>
      mergeOverrides(
        { "aliased-package": "npm:@safe/foo@1.0.0" },
        { "aliased-package": { ".": "npm:@other/foo@1.0.0", child: "2.0.0" } },
        {},
      ),
    ).toThrow(/conflicts with pnpm lock policy/u);
    expect(() =>
      mergeOverrides(
        { "aliased-package": { ".": "npm:@safe/foo@1.0.0", child: "2.0.0" } },
        { "aliased-package": "npm:@other/foo@1.0.0" },
        {},
      ),
    ).toThrow(/conflicts with pnpm lock policy/u);
  });

  it("keeps npm shrinkwrap package versions inside the pnpm lock graph", () => {
    const pnpmLockPackages = collectPnpmLockPackages();
    // The fork ships no root npm-shrinkwrap.json and only publishes per-plugin shrinkwraps for
    // extensions marked publishToNpm (see the sibling "ships shrinkwrap for every publishable plugin
    // package" test). Non-publishable extensions carry vestigial upstream shrinkwraps that never
    // ship, so only the publishable plugin shrinkwraps are checked against the pnpm lock graph.
    const shrinkwrapPaths = fs
      .readdirSync("extensions", { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .filter((entry) => {
        const packageJsonPath = `extensions/${entry.name}/package.json`;
        if (!fs.existsSync(packageJsonPath)) {
          return false;
        }
        const packageJson = readJson(packageJsonPath) as {
          remoteclaw?: { release?: { publishToNpm?: boolean } };
        };
        return packageJson.remoteclaw?.release?.publishToNpm === true;
      })
      .map((entry) => `extensions/${entry.name}/npm-shrinkwrap.json`)
      .filter((shrinkwrapPath) => fs.existsSync(shrinkwrapPath))
      .toSorted((left, right) => left.localeCompare(right));

    for (const shrinkwrapPath of shrinkwrapPaths) {
      const shrinkwrap = readJson(shrinkwrapPath);
      expect(collectPnpmLockViolations(shrinkwrap, pnpmLockPackages), shrinkwrapPath).toEqual([]);
    }
  });

  it("ships shrinkwrap for every publishable plugin package", () => {
    for (const entry of fs.readdirSync("extensions", { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }
      const packageJsonPath = `extensions/${entry.name}/package.json`;
      if (!fs.existsSync(packageJsonPath)) {
        continue;
      }
      const packageJson = readJson(packageJsonPath) as {
        name?: string;
        version?: string;
        remoteclaw?: { release?: { publishToNpm?: boolean } };
      };
      if (packageJson.remoteclaw?.release?.publishToNpm !== true) {
        continue;
      }

      const shrinkwrapPath = `extensions/${entry.name}/npm-shrinkwrap.json`;
      const shrinkwrap = readJson(shrinkwrapPath) as NpmShrinkwrap;
      const devLockedPackages = Object.entries(shrinkwrap.packages ?? {}).filter(
        ([, lockedPackage]) => lockedPackage.dev === true,
      );

      expect(shrinkwrap.name, shrinkwrapPath).toBe(packageJson.name);
      expect(shrinkwrap.version, shrinkwrapPath).toBe(packageJson.version);
      expect(shrinkwrap.packages?.[""]?.name, shrinkwrapPath).toBe(packageJson.name);
      expect(shrinkwrap.packages?.[""]?.version, shrinkwrapPath).toBe(packageJson.version);
      expect(devLockedPackages, shrinkwrapPath).toEqual([]);
    }
  });
});
