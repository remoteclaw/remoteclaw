import fs from "node:fs";
import path from "node:path";
import {
  BUNDLED_PLUGIN_ROOT_DIR,
  bundledDistPluginFile,
  bundledPluginFile,
} from "./bundled-plugin-paths.mjs";
import { shouldBuildBundledCluster } from "./optional-bundled-clusters.mjs";

const TOP_LEVEL_PUBLIC_SURFACE_EXTENSIONS = new Set([".ts", ".js", ".mts", ".cts", ".mjs", ".cjs"]);
export const NON_PACKAGED_BUNDLED_PLUGIN_DIRS = new Set(["qa-channel", "qa-lab", "qa-matrix"]);
const EXCLUDED_CORE_BUNDLED_PLUGIN_DIRS = new Set(["qqbot"]);
const BUNDLED_PLUGIN_BUILD_IDS_ENV = "REMOTECLAW_BUNDLED_PLUGIN_BUILD_IDS";
const toPosixPath = (value) => value.replaceAll("\\", "/");

function parseBundledPluginBuildIdFilter(env = process.env) {
  const raw = env[BUNDLED_PLUGIN_BUILD_IDS_ENV];
  if (typeof raw !== "string" || raw.trim() === "") {
    return null;
  }
  return new Set(
    raw
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  );
}

function readBundledPluginPackageJson(packageJsonPath) {
  if (!fs.existsSync(packageJsonPath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  } catch {
    return null;
  }
}

function isManifestlessBundledRuntimeSupportPackage(params) {
  const packageName = typeof params.packageJson?.name === "string" ? params.packageJson.name : "";
  if (packageName !== `@remoteclaw/${params.dirName}`) {
    return false;
  }
  return params.topLevelPublicSurfaceEntries.length > 0;
}

export function collectPluginSourceEntries(packageJson, pluginDir) {
  let packageEntries = Array.isArray(packageJson?.remoteclaw?.extensions)
    ? packageJson.remoteclaw.extensions.filter(
        (entry) => typeof entry === "string" && entry.trim().length > 0,
      )
    : [];
  const setupEntry =
    typeof packageJson?.remoteclaw?.setupEntry === "string" &&
    packageJson.remoteclaw.setupEntry.trim().length > 0
      ? packageJson.remoteclaw.setupEntry
      : undefined;
  if (setupEntry) {
    packageEntries = Array.from(new Set([...packageEntries, setupEntry]));
  }
  if (packageEntries.length > 0) {
    return packageEntries;
  }
  // Fall back to the conventional ./index.ts entrypoint ONLY when it exists.
  // A manifest-only plugin — a config-schema declaration with no runtime
  // entrypoint (e.g. active-memory: a remoteclaw.plugin.json with no
  // package.json and no index.ts) — must not synthesize a phantom ./index.ts
  // build entry that points at a nonexistent file.
  return fs.existsSync(path.join(pluginDir, "index.ts")) ? ["./index.ts"] : [];
}

export function collectTopLevelPublicSurfaceEntries(pluginDir) {
  if (!fs.existsSync(pluginDir)) {
    return [];
  }

  return fs
    .readdirSync(pluginDir, { withFileTypes: true })
    .flatMap((dirent) => {
      if (!dirent.isFile()) {
        return [];
      }

      const ext = path.extname(dirent.name);
      if (!TOP_LEVEL_PUBLIC_SURFACE_EXTENSIONS.has(ext)) {
        return [];
      }

      const normalizedName = dirent.name.toLowerCase();
      if (
        normalizedName.endsWith(".d.ts") ||
        /^config-api\.(?:[cm]?[jt]s)$/u.test(normalizedName) ||
        normalizedName.includes(".test.") ||
        normalizedName.includes(".spec.") ||
        normalizedName.includes(".fixture.") ||
        normalizedName.includes(".snap")
      ) {
        return [];
      }

      return [`./${dirent.name}`];
    })
    .toSorted((left, right) => left.localeCompare(right));
}

export function collectBundledPluginBuildEntries(params = {}) {
  const cwd = params.cwd ?? process.cwd();
  const env = params.env ?? process.env;
  const extensionsRoot = path.join(cwd, BUNDLED_PLUGIN_ROOT_DIR);
  const entries = [];

  for (const dirent of fs.readdirSync(extensionsRoot, { withFileTypes: true })) {
    if (!dirent.isDirectory()) {
      continue;
    }

    const pluginDir = path.join(extensionsRoot, dirent.name);
    const manifestPath = path.join(pluginDir, "remoteclaw.plugin.json");
    const hasManifest = fs.existsSync(manifestPath);
    const packageJsonPath = path.join(pluginDir, "package.json");
    const packageJson = readBundledPluginPackageJson(packageJsonPath);
    const topLevelPublicSurfaceEntries = collectTopLevelPublicSurfaceEntries(pluginDir);
    if (
      !hasManifest &&
      !isManifestlessBundledRuntimeSupportPackage({
        dirName: dirent.name,
        packageJson,
        topLevelPublicSurfaceEntries,
      })
    ) {
      continue;
    }
    if (!shouldBuildBundledCluster(dirent.name, env, { packageJson })) {
      continue;
    }
    if (EXCLUDED_CORE_BUNDLED_PLUGIN_DIRS.has(dirent.name)) {
      continue;
    }

    entries.push({
      id: dirent.name,
      hasManifest,
      hasPackageJson: packageJson !== null,
      packageJson,
      sourceEntries: Array.from(
        new Set([
          ...(hasManifest ? collectPluginSourceEntries(packageJson, pluginDir) : []),
          ...topLevelPublicSurfaceEntries,
        ]),
      ),
    });
  }

  const filteredBuildIds = parseBundledPluginBuildIdFilter(env);
  if (!filteredBuildIds) {
    return entries;
  }
  const buildableIds = new Set(entries.map((entry) => entry.id));
  const missingIds = [...filteredBuildIds].filter((id) => !buildableIds.has(id));
  if (missingIds.length > 0) {
    throw new Error(
      `${BUNDLED_PLUGIN_BUILD_IDS_ENV} references unknown bundled plugin id(s): ${missingIds
        .toSorted((left, right) => left.localeCompare(right))
        .join(", ")}`,
    );
  }
  return entries.filter((entry) => filteredBuildIds.has(entry.id));
}

export function listBundledPluginBuildEntries(params = {}) {
  return Object.fromEntries(
    collectBundledPluginBuildEntries(params).flatMap(({ id, sourceEntries }) =>
      sourceEntries.map((entry) => {
        const normalizedEntry = entry.replace(/^\.\//, "");
        const entryKey = bundledPluginFile(id, normalizedEntry.replace(/\.[^.]+$/u, ""));
        return [entryKey, toPosixPath(path.join(BUNDLED_PLUGIN_ROOT_DIR, id, normalizedEntry))];
      }),
    ),
  );
}

export function collectRootPackageExcludedExtensionDirs(params = {}) {
  const cwd = params.cwd ?? process.cwd();
  const packageJsonPath = path.join(cwd, "package.json");
  const excluded = new Set();
  if (!fs.existsSync(packageJsonPath)) {
    return excluded;
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  for (const entry of packageJson.files ?? []) {
    if (typeof entry !== "string") {
      continue;
    }
    const match = /^!dist\/extensions\/([^/]+)\/\*\*$/u.exec(entry);
    if (match?.[1]) {
      excluded.add(match[1]);
    }
  }
  return excluded;
}

export function listBundledPluginPackArtifacts(params = {}) {
  const excludedPackageDirs =
    params.includeRootPackageExcludedDirs === true
      ? new Set()
      : collectRootPackageExcludedExtensionDirs(params);
  const entries = collectBundledPluginBuildEntries(params).filter(
    ({ id }) => !NON_PACKAGED_BUNDLED_PLUGIN_DIRS.has(id) && !excludedPackageDirs.has(id),
  );
  const artifacts = new Set();

  for (const { id, hasManifest, hasPackageJson, sourceEntries } of entries) {
    if (hasManifest) {
      artifacts.add(bundledDistPluginFile(id, "remoteclaw.plugin.json"));
    }
    if (hasPackageJson) {
      artifacts.add(bundledDistPluginFile(id, "package.json"));
    }
    for (const entry of sourceEntries) {
      const normalizedEntry = entry.replace(/^\.\//, "").replace(/\.[^.]+$/u, "");
      artifacts.add(bundledDistPluginFile(id, `${normalizedEntry}.js`));
    }
  }

  return [...artifacts].toSorted((left, right) => left.localeCompare(right));
}
