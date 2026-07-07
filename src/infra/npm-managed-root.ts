import fs from "node:fs/promises";
import path from "node:path";
import { runCommandWithTimeout } from "../process/exec.js";
import type { NpmSpecResolution } from "./install-source-utils.js";
import type { ParsedRegistryNpmSpec } from "./npm-registry-spec.js";
import { resolveRemoteClawPackageRootSync } from "./remoteclaw-root.js";
import { createSafeNpmInstallEnv } from "./safe-package-install.js";

type ManagedNpmRootManifest = {
  private?: boolean;
  dependencies?: Record<string, string>;
  overrides?: Record<string, unknown>;
  [key: string]: unknown;
};

type HostPackageManifest = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  overrides?: Record<string, unknown>;
  peerDependencies?: Record<string, string>;
};

type ManagedNpmRootRemoteClawMetadata = {
  managedOverrides?: string[];
  [key: string]: unknown;
};

export type ManagedNpmRootInstalledDependency = {
  version?: string;
  integrity?: string;
  resolved?: string;
};

type ManagedNpmRootLockfile = {
  packages?: Record<string, unknown>;
  dependencies?: Record<string, unknown>;
  [key: string]: unknown;
};

type ManagedNpmRootLogger = {
  warn?: (message: string) => void;
};

type ManagedNpmRootRunCommand = typeof runCommandWithTimeout;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readDependencyRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }
  const dependencies: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === "string") {
      dependencies[key] = raw;
    }
  }
  return dependencies;
}

function readOverrideRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }
  const overrides: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (key.trim()) {
      overrides[key] = raw;
    }
  }
  return overrides;
}

function readManagedOverrideKeys(value: unknown): string[] {
  if (!isRecord(value) || !Array.isArray(value.managedOverrides)) {
    return [];
  }
  return value.managedOverrides.filter((key): key is string => typeof key === "string");
}

function buildManagedRemoteClawMetadata(params: {
  current: unknown;
  managedOverrideKeys: string[];
}): ManagedNpmRootRemoteClawMetadata | undefined {
  const metadata: ManagedNpmRootRemoteClawMetadata = isRecord(params.current)
    ? { ...params.current }
    : {};
  if (params.managedOverrideKeys.length > 0) {
    metadata.managedOverrides = params.managedOverrideKeys;
  } else {
    delete metadata.managedOverrides;
  }
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

async function readManagedNpmRootManifest(filePath: string): Promise<ManagedNpmRootManifest> {
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
    return isRecord(parsed) ? { ...parsed } : {};
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    throw err;
  }
}

function readHostDependencySpec(
  manifest: HostPackageManifest,
  packageName: string,
): string | undefined {
  return (
    manifest.dependencies?.[packageName] ??
    manifest.optionalDependencies?.[packageName] ??
    manifest.peerDependencies?.[packageName] ??
    manifest.devDependencies?.[packageName]
  );
}

function resolveHostOverrideReferences(value: unknown, manifest: HostPackageManifest): unknown {
  if (typeof value === "string" && value.startsWith("$")) {
    return readHostDependencySpec(manifest, value.slice(1)) ?? value;
  }
  if (!isRecord(value)) {
    return value;
  }
  const resolved: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    resolved[key] = resolveHostOverrideReferences(nested, manifest);
  }
  return resolved;
}

export async function readRemoteClawManagedNpmRootOverrides(params?: {
  argv1?: string;
  cwd?: string;
  moduleUrl?: string;
  packageRoot?: string | null;
}): Promise<Record<string, unknown>> {
  const packageRoot =
    params?.packageRoot ??
    resolveRemoteClawPackageRootSync({
      argv1: params?.argv1 ?? process.argv[1],
      moduleUrl: params?.moduleUrl ?? import.meta.url,
      cwd: params?.cwd ?? process.cwd(),
    });
  if (!packageRoot) {
    return {};
  }
  try {
    const manifest = JSON.parse(
      await fs.readFile(path.join(packageRoot, "package.json"), "utf8"),
    ) as unknown;
    if (!isRecord(manifest)) {
      return {};
    }
    const hostManifest = manifest as HostPackageManifest;
    const overrides = readOverrideRecord(hostManifest.overrides);
    return Object.fromEntries(
      Object.entries(overrides).map(([key, value]) => [
        key,
        resolveHostOverrideReferences(value, hostManifest),
      ]),
    );
  } catch {
    return {};
  }
}

export function resolveManagedNpmRootDependencySpec(params: {
  parsedSpec: ParsedRegistryNpmSpec;
  resolution: NpmSpecResolution;
}): string {
  return params.resolution.version ?? params.parsedSpec.selector ?? "latest";
}

export async function upsertManagedNpmRootDependency(params: {
  npmRoot: string;
  packageName: string;
  dependencySpec: string;
  managedOverrides?: Record<string, unknown>;
}): Promise<void> {
  await fs.mkdir(params.npmRoot, { recursive: true });
  const manifestPath = path.join(params.npmRoot, "package.json");
  const manifest = await readManagedNpmRootManifest(manifestPath);
  const dependencies = readDependencyRecord(manifest.dependencies);
  const managedOverrides = readOverrideRecord(params.managedOverrides);
  const managedOverrideKeys = Object.keys(managedOverrides).toSorted();
  const overrides = readOverrideRecord(manifest.overrides);
  for (const key of readManagedOverrideKeys(manifest.remoteclaw)) {
    delete overrides[key];
  }
  Object.assign(overrides, managedOverrides);
  const remoteclawMetadata = buildManagedRemoteClawMetadata({
    current: manifest.remoteclaw,
    managedOverrideKeys,
  });
  const next: ManagedNpmRootManifest = {
    ...manifest,
    private: true,
    dependencies: {
      ...dependencies,
      [params.packageName]: params.dependencySpec,
    },
  };
  if (Object.keys(overrides).length > 0) {
    next.overrides = overrides;
  } else {
    delete next.overrides;
  }
  if (remoteclawMetadata) {
    next.remoteclaw = remoteclawMetadata;
  } else {
    delete next.remoteclaw;
  }
  await fs.writeFile(manifestPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
}

export async function repairManagedNpmRootRemoteClawPeer(params: {
  npmRoot: string;
  timeoutMs?: number;
  logger?: ManagedNpmRootLogger;
  runCommand?: ManagedNpmRootRunCommand;
}): Promise<boolean> {
  await fs.mkdir(params.npmRoot, { recursive: true });

  const manifestPath = path.join(params.npmRoot, "package.json");
  const manifest = await readManagedNpmRootManifest(manifestPath);
  const dependencies = readDependencyRecord(manifest.dependencies);
  const hasManifestDependency = "remoteclaw" in dependencies;
  const hasLockDependency = await managedNpmRootLockfileHasRemoteClawPeer(params.npmRoot);
  const hasPackageDir = await pathExists(path.join(params.npmRoot, "node_modules", "remoteclaw"));
  if (!hasManifestDependency && !hasLockDependency && !hasPackageDir) {
    return false;
  }

  const command = params.runCommand ?? runCommandWithTimeout;
  const npmArgs = hasManifestDependency
    ? [
        "npm",
        "uninstall",
        "--loglevel=error",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        "--prefix",
        ".",
        "remoteclaw",
      ]
    : [
        "npm",
        "prune",
        "--loglevel=error",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        "--prefix",
        ".",
      ];
  try {
    const result = await command(npmArgs, {
      cwd: params.npmRoot,
      timeoutMs: Math.max(params.timeoutMs ?? 300_000, 300_000),
      env: createSafeNpmInstallEnv(process.env, { packageLock: true, quiet: true }),
    });
    if (result.code !== 0) {
      params.logger?.warn?.(
        `npm ${hasManifestDependency ? "uninstall remoteclaw" : "prune"} failed while repairing managed npm root; falling back to direct cleanup: ${result.stderr.trim() || result.stdout.trim()}`,
      );
    }
  } catch (error) {
    params.logger?.warn?.(
      `npm ${hasManifestDependency ? "uninstall remoteclaw" : "prune"} failed while repairing managed npm root; falling back to direct cleanup: ${String(error)}`,
    );
  }

  await scrubManagedNpmRootRemoteClawPeer({ npmRoot: params.npmRoot });
  return true;
}

async function managedNpmRootLockfileHasRemoteClawPeer(npmRoot: string): Promise<boolean> {
  const lockPath = path.join(npmRoot, "package-lock.json");
  try {
    const parsed = JSON.parse(await fs.readFile(lockPath, "utf8")) as ManagedNpmRootLockfile;
    if (isRecord(parsed.packages)) {
      const rootPackage = parsed.packages[""];
      if (
        isRecord(rootPackage) &&
        isRecord(rootPackage.dependencies) &&
        "remoteclaw" in rootPackage.dependencies
      ) {
        return true;
      }
      if ("node_modules/remoteclaw" in parsed.packages) {
        return true;
      }
    }
    return isRecord(parsed.dependencies) && "remoteclaw" in parsed.dependencies;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw err;
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  return await fs
    .lstat(filePath)
    .then(() => true)
    .catch((err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") {
        return false;
      }
      throw err;
    });
}

async function scrubManagedNpmRootRemoteClawPeer(params: { npmRoot: string }): Promise<void> {
  const manifestPath = path.join(params.npmRoot, "package.json");
  const manifest = await readManagedNpmRootManifest(manifestPath);
  const dependencies = readDependencyRecord(manifest.dependencies);
  if ("remoteclaw" in dependencies) {
    const { remoteclaw: _removed, ...nextDependencies } = dependencies;
    await fs.writeFile(
      manifestPath,
      `${JSON.stringify({ ...manifest, private: true, dependencies: nextDependencies }, null, 2)}\n`,
      "utf8",
    );
  }

  const lockPath = path.join(params.npmRoot, "package-lock.json");
  try {
    const parsed = JSON.parse(await fs.readFile(lockPath, "utf8")) as ManagedNpmRootLockfile;
    let lockChanged = false;
    if (isRecord(parsed.packages)) {
      const rootPackage = parsed.packages[""];
      if (isRecord(rootPackage) && isRecord(rootPackage.dependencies)) {
        const dependencies = { ...rootPackage.dependencies };
        if ("remoteclaw" in dependencies) {
          delete dependencies.remoteclaw;
          parsed.packages[""] = { ...rootPackage, dependencies };
          lockChanged = true;
        }
      }
      if ("node_modules/remoteclaw" in parsed.packages) {
        delete parsed.packages["node_modules/remoteclaw"];
        lockChanged = true;
      }
    }
    if (isRecord(parsed.dependencies) && "remoteclaw" in parsed.dependencies) {
      const dependencies = { ...parsed.dependencies };
      delete dependencies.remoteclaw;
      parsed.dependencies = dependencies;
      lockChanged = true;
    }
    if (lockChanged) {
      await fs.writeFile(lockPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      throw err;
    }
  }

  const remoteclawPackageDir = path.join(params.npmRoot, "node_modules", "remoteclaw");
  if (await pathExists(remoteclawPackageDir)) {
    await fs.rm(remoteclawPackageDir, { recursive: true, force: true });
  }
  const binDir = path.join(params.npmRoot, "node_modules", ".bin");
  await Promise.all(
    ["remoteclaw", "remoteclaw.cmd", "remoteclaw.ps1"].map((binName) =>
      fs.rm(path.join(binDir, binName), { force: true }),
    ),
  );
  await fs.rm(path.join(params.npmRoot, "node_modules", ".package-lock.json"), {
    force: true,
  });
}

export async function readManagedNpmRootInstalledDependency(params: {
  npmRoot: string;
  packageName: string;
}): Promise<ManagedNpmRootInstalledDependency | null> {
  const lockPath = path.join(params.npmRoot, "package-lock.json");
  const parsed = JSON.parse(await fs.readFile(lockPath, "utf8")) as unknown;
  if (!isRecord(parsed) || !isRecord(parsed.packages)) {
    return null;
  }
  const entry = parsed.packages[`node_modules/${params.packageName}`];
  if (!isRecord(entry)) {
    return null;
  }
  return {
    version: readOptionalString(entry.version),
    integrity: readOptionalString(entry.integrity),
    resolved: readOptionalString(entry.resolved),
  };
}

export async function removeManagedNpmRootDependency(params: {
  npmRoot: string;
  packageName: string;
}): Promise<void> {
  const manifestPath = path.join(params.npmRoot, "package.json");
  const manifest = await readManagedNpmRootManifest(manifestPath);
  const dependencies = readDependencyRecord(manifest.dependencies);
  if (!(params.packageName in dependencies)) {
    return;
  }
  const { [params.packageName]: _removed, ...nextDependencies } = dependencies;
  const next: ManagedNpmRootManifest = {
    ...manifest,
    private: true,
    dependencies: nextDependencies,
  };
  await fs.writeFile(manifestPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
}
