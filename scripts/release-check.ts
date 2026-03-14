#!/usr/bin/env -S node --import tsx

import { execSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

type PackFile = { path: string };
type PackResult = { files?: PackFile[] };
type PackageJson = {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  remoteclaw?: {
    install?: {
      npmSpec?: string;
    };
    releaseChecks?: {
      rootDependencyMirrorAllowlist?: unknown[];
    };
  };
};
type BundledExtension = { id: string; packageJson: PackageJson };
type BundledExtensionMetadata = BundledExtension & {
  npmSpec?: string;
  rootDependencyMirrorAllowlist: string[];
};

const requiredPathGroups = [
  ["dist/index.js", "dist/index.mjs"],
  ["dist/entry.js", "dist/entry.mjs"],
  "dist/plugin-sdk/index.js",
  "dist/plugin-sdk/index.d.ts",
  "dist/build-info.json",
];
const forbiddenPrefixes = ["dist/RemoteClaw.app/"];

function normalizePluginSyncVersion(version: string): string {
  const normalized = version.trim().replace(/^v/, "");
  const base = /^([0-9]+\.[0-9]+\.[0-9]+)/.exec(normalized)?.[1];
  if (base) {
    return base;
  }
  return normalized.replace(/[-+].*$/, "");
}

const ALLOWLISTED_BUNDLED_EXTENSION_ROOT_DEP_GAPS: Record<string, string[]> = {
  googlechat: ["google-auth-library"],
  matrix: ["@matrix-org/matrix-sdk-crypto-nodejs", "@vector-im/matrix-bot-sdk", "music-metadata"],
  msteams: ["@microsoft/agents-hosting"],
  nostr: ["nostr-tools"],
  tlon: ["@tloncorp/api", "@tloncorp/tlon-skill", "@urbit/aura"],
  zalouser: ["zca-js"],
};

export function collectBundledExtensionRootDependencyGapErrors(params: {
  rootPackage: PackageJson;
  extensions: BundledExtension[];
}): string[] {
  const rootDeps = {
    ...params.rootPackage.dependencies,
    ...params.rootPackage.optionalDependencies,
  };
  const errors: string[] = [];

  for (const extension of normalizeBundledExtensionMetadata(params.extensions)) {
    if (!extension.npmSpec) {
      continue;
    }

    const missing = Object.keys(extension.packageJson.dependencies ?? {})
      .filter((dep) => dep !== "remoteclaw" && !rootDeps[dep])
      .toSorted();
    const allowlisted = [
      ...(ALLOWLISTED_BUNDLED_EXTENSION_ROOT_DEP_GAPS[extension.id] ?? []),
    ].toSorted();
    if (missing.join("\n") !== allowlisted.join("\n")) {
      const unexpected = missing.filter((dep) => !allowlisted.includes(dep));
      const resolved = allowlisted.filter((dep) => !missing.includes(dep));
      const parts = [
        `bundled extension '${extension.id}' root dependency mirror drift`,
        `missing in root package: ${missing.length > 0 ? missing.join(", ") : "(none)"}`,
      ];
      if (unexpected.length > 0) {
        parts.push(`new gaps: ${unexpected.join(", ")}`);
      }
      if (resolved.length > 0) {
        parts.push(`remove stale allowlist entries: ${resolved.join(", ")}`);
      }
      errors.push(parts.join(" | "));
    }
  }

  return errors;
}

function normalizeBundledExtensionMetadata(
  extensions: BundledExtension[],
): BundledExtensionMetadata[] {
  return extensions.map((extension) => ({
    ...extension,
    npmSpec:
      typeof extension.packageJson.remoteclaw?.install?.npmSpec === "string"
        ? extension.packageJson.remoteclaw.install.npmSpec.trim()
        : undefined,
    rootDependencyMirrorAllowlist:
      extension.packageJson.remoteclaw?.releaseChecks?.rootDependencyMirrorAllowlist?.filter(
        (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
      ) ?? [],
  }));
}

export function collectBundledExtensionManifestErrors(extensions: BundledExtension[]): string[] {
  const errors: string[] = [];
  for (const extension of extensions) {
    const install = extension.packageJson.remoteclaw?.install;
    if (
      install &&
      (!install.npmSpec || typeof install.npmSpec !== "string" || !install.npmSpec.trim())
    ) {
      errors.push(
        `bundled extension '${extension.id}' manifest invalid | remoteclaw.install.npmSpec must be a non-empty string`,
      );
    }

    const allowlist =
      extension.packageJson.remoteclaw?.releaseChecks?.rootDependencyMirrorAllowlist;
    if (allowlist === undefined) {
      continue;
    }
    if (!Array.isArray(allowlist)) {
      errors.push(
        `bundled extension '${extension.id}' manifest invalid | remoteclaw.releaseChecks.rootDependencyMirrorAllowlist must be an array of non-empty strings`,
      );
      continue;
    }
    const invalidEntries = allowlist.filter((entry) => typeof entry !== "string" || !entry.trim());
    if (invalidEntries.length > 0) {
      errors.push(
        `bundled extension '${extension.id}' manifest invalid | remoteclaw.releaseChecks.rootDependencyMirrorAllowlist must contain only non-empty strings`,
      );
    }
  }
  return errors;
}

function collectBundledExtensions(): BundledExtension[] {
  const extensionsDir = resolve("extensions");
  const entries = readdirSync(extensionsDir, { withFileTypes: true }).filter((entry) =>
    entry.isDirectory(),
  );

  return entries.flatMap((entry) => {
    const packagePath = join(extensionsDir, entry.name, "package.json");
    try {
      return [
        {
          id: entry.name,
          packageJson: JSON.parse(readFileSync(packagePath, "utf8")) as PackageJson,
        },
      ];
    } catch {
      return [];
    }
  });
}

function checkBundledExtensionRootDependencyMirrors() {
  const rootPackage = JSON.parse(readFileSync(resolve("package.json"), "utf8")) as PackageJson;
  const extensions = collectBundledExtensions();
  const manifestErrors = collectBundledExtensionManifestErrors(extensions);
  if (manifestErrors.length > 0) {
    console.error("release-check: bundled extension manifest validation failed:");
    for (const error of manifestErrors) {
      console.error(`  - ${error}`);
    }
    process.exit(1);
  }
  const errors = collectBundledExtensionRootDependencyGapErrors({
    rootPackage,
    extensions,
  });
  if (errors.length > 0) {
    console.error("release-check: bundled extension root dependency mirror validation failed:");
    for (const error of errors) {
      console.error(`  - ${error}`);
    }
    process.exit(1);
  }
}

function runPackDry(): PackResult[] {
  const raw = execSync("npm pack --dry-run --json --ignore-scripts", {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 1024 * 1024 * 100,
  });
  return JSON.parse(raw) as PackResult[];
}

function checkPluginVersions() {
  const rootPackagePath = resolve("package.json");
  const rootPackage = JSON.parse(readFileSync(rootPackagePath, "utf8")) as PackageJson;
  const targetVersion = rootPackage.version;
  const targetBaseVersion = targetVersion ? normalizePluginSyncVersion(targetVersion) : null;

  if (!targetVersion || !targetBaseVersion) {
    console.error("release-check: root package.json missing version.");
    process.exit(1);
  }

  const extensionsDir = resolve("extensions");
  const entries = readdirSync(extensionsDir, { withFileTypes: true }).filter((entry) =>
    entry.isDirectory(),
  );

  const mismatches: string[] = [];

  for (const entry of entries) {
    const packagePath = join(extensionsDir, entry.name, "package.json");
    let pkg: PackageJson;
    try {
      pkg = JSON.parse(readFileSync(packagePath, "utf8")) as PackageJson;
    } catch {
      continue;
    }

    if (!pkg.name || !pkg.version) {
      continue;
    }

    if (normalizePluginSyncVersion(pkg.version) !== targetBaseVersion) {
      mismatches.push(`${pkg.name} (${pkg.version})`);
    }
  }

  if (mismatches.length > 0) {
    console.error(
      `release-check: plugin versions must match release base ${targetBaseVersion} (root ${targetVersion}):`,
    );
    for (const item of mismatches) {
      console.error(`  - ${item}`);
    }
    console.error("release-check: run `pnpm plugins:sync` to align plugin versions.");
    process.exit(1);
  }
}

function main() {
  checkPluginVersions();
  checkBundledExtensionRootDependencyMirrors();

  const results = runPackDry();
  const files = results.flatMap((entry) => entry.files ?? []);
  const paths = new Set(files.map((file) => file.path));

  const missing = requiredPathGroups
    .flatMap((group) => {
      if (Array.isArray(group)) {
        return group.some((path) => paths.has(path)) ? [] : [group.join(" or ")];
      }
      return paths.has(group) ? [] : [group];
    })
    .toSorted();
  const forbidden = [...paths].filter((path) =>
    forbiddenPrefixes.some((prefix) => path.startsWith(prefix)),
  );

  if (missing.length > 0 || forbidden.length > 0) {
    if (missing.length > 0) {
      console.error("release-check: missing files in npm pack:");
      for (const path of missing) {
        console.error(`  - ${path}`);
      }
    }
    if (forbidden.length > 0) {
      console.error("release-check: forbidden files in npm pack:");
      for (const path of forbidden) {
        console.error(`  - ${path}`);
      }
    }
    process.exit(1);
  }

  console.log("release-check: npm pack contents look OK.");
}

main();
