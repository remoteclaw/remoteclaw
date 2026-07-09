import fs from "node:fs";
import path from "node:path";
import { resolveAgentWorkspaceDir, resolveDefaultAgentId } from "../../agents/agent-scope.js";
import type { ChannelPluginCatalogEntry } from "../../channels/plugins/catalog.js";
import { resolveBundledInstallPlanForCatalogEntry } from "../../cli/plugin-install-plan.js";
import type { RemoteClawConfig } from "../../config/config.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import {
  findBundledPluginSourceInMap,
  resolveBundledPluginSources,
} from "../../plugins/bundled-sources.js";
import { clearPluginDiscoveryCache } from "../../plugins/discovery.js";
import { enablePluginInConfig } from "../../plugins/enable.js";
import { installPluginFromNpmSpec } from "../../plugins/install.js";
import { buildNpmResolutionInstallFields, recordPluginInstall } from "../../plugins/installs.js";
import { loadRemoteClawPlugins } from "../../plugins/loader.js";
import { createPluginLoaderLogger } from "../../plugins/logger.js";
import type { RuntimeEnv } from "../../runtime.js";
import type { WizardPrompter } from "../../wizard/prompts.js";

type InstallChoice = "npm" | "local" | "skip";

type InstallResult = {
  cfg: RemoteClawConfig;
  installed: boolean;
};

function resolveRealDirectory(dir: string): string | null {
  try {
    const resolved = fs.realpathSync(dir);
    return fs.statSync(resolved).isDirectory() ? resolved : null;
  } catch {
    return null;
  }
}

function resolveGitDirectoryMarker(dir: string): string | null {
  const marker = path.join(dir, ".git");
  try {
    const stat = fs.statSync(marker);
    if (stat.isDirectory()) {
      return resolveRealDirectory(marker);
    }
    if (!stat.isFile()) {
      return null;
    }
    // A `.git` FILE is a gitdir pointer (worktrees, submodules): `gitdir: <path>`.
    const content = fs.readFileSync(marker, "utf8").trim();
    const gitDir = /^gitdir:\s*(.+)$/i.exec(content)?.[1]?.trim();
    if (!gitDir) {
      return null;
    }
    return resolveRealDirectory(path.isAbsolute(gitDir) ? gitDir : path.resolve(dir, gitDir));
  } catch {
    return null;
  }
}

// Exported for unit testing of the load-path containment hardening (issue #2838).
export function isWithinBaseDirectory(baseDir: string, targetPath: string): boolean {
  const relative = path.relative(baseDir, targetPath);
  return (
    relative === "" ||
    (!path.isAbsolute(relative) && !relative.startsWith(`..${path.sep}`) && relative !== "..")
  );
}

export function hasTrustedGitWorkspace(root: string): boolean {
  const realRoot = resolveRealDirectory(root);
  if (!realRoot) {
    return false;
  }
  for (let dir = realRoot; ; dir = path.dirname(dir)) {
    if (resolveGitDirectoryMarker(dir)) {
      return true;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return false;
    }
  }
}

function hasGitWorkspace(workspaceDir?: string): boolean {
  const roots = [process.cwd()];
  if (workspaceDir && workspaceDir !== process.cwd()) {
    roots.push(workspaceDir);
  }
  return roots.some((root) => hasTrustedGitWorkspace(root));
}

export function resolveLocalPath(
  entry: ChannelPluginCatalogEntry,
  workspaceDir: string | undefined,
  allowLocal: boolean,
): string | null {
  if (!allowLocal) {
    return null;
  }
  const raw = entry.install.localPath?.trim();
  if (!raw) {
    return null;
  }
  const bases = [process.cwd()];
  if (workspaceDir && workspaceDir !== process.cwd()) {
    bases.push(workspaceDir);
  }
  const candidates = new Set<string>();
  for (const base of bases) {
    const realBase = resolveRealDirectory(base);
    if (realBase) {
      candidates.add(path.resolve(realBase, raw));
    }
  }
  for (const candidate of candidates) {
    try {
      // Realpath BEFORE the containment check so a symlink cannot point the
      // resolved target outside a trusted base. Reject anything that escapes
      // (symlink / `..` / absolute) or is not a directory.
      const resolved = fs.realpathSync(candidate);
      const withinTrustedBase = bases.some((base) => {
        const realBase = resolveRealDirectory(base);
        return realBase ? isWithinBaseDirectory(realBase, resolved) : false;
      });
      if (!withinTrustedBase) {
        continue;
      }
      if (fs.statSync(resolved).isDirectory()) {
        return resolved;
      }
    } catch {
      // Missing / unreadable / broken-symlink candidate — fall through to the
      // next candidate, then to null (which drives the npm-install fallback).
      continue;
    }
  }
  return null;
}

/**
 * Registers a local plugin directory as a load path WITHOUT running the
 * dangerous-code scanner that the npm / archive / path install flows enforce
 * (see src/plugins/install.ts). This unscanned path is a deliberate, reviewed
 * exception — not an oversight:
 *
 *   - `pluginPath` is never a user-typed path. It is resolved from the
 *     first-party channel catalog (`entry.install.localPath`) or a bundled
 *     plugin source shipped inside this repo — i.e. code we author and release,
 *     not an arbitrary third-party plugin.
 *   - The local option is only offered when a git workspace is present
 *     (`hasGitWorkspace`) and the resolved path exists on disk — i.e. a
 *     developer running from a checkout, not an end user.
 *   - First-party channel plugins legitimately trip the scanner's critical
 *     rules: e.g. the Signal plugin shells out to signal-cli via
 *     child_process.spawn (extensions/signal/src/daemon.ts). Scanning-and-
 *     blocking here would break that first-party flow, and the onboarding
 *     wizard has no UI to set the `dangerouslyForceUnsafeInstall` override
 *     (that override is CLI-only), so there would be no supported way to
 *     proceed.
 *
 * Residual after hardening: `resolveLocalPath` now realpaths each candidate,
 * requires the resolved target to stay within a trusted base directory
 * (realpath'd CWD or agent workspace, via `isWithinBaseDirectory`), and gates
 * to directories only — closing the symlink / `..` / absolute-path escape and
 * the file-vs-directory sub-vectors. `hasGitWorkspace` likewise realpaths and
 * walks up for a `.git` marker (directory or gitdir-pointer file) rather than a
 * bare existence check. What remains is narrow: an attacker who can already
 * write a directory at the exact catalog-relative location INSIDE the trusted
 * workspace could still have it registered unscanned — but that presupposes
 * write access to the victim's checkout, itself a serious local compromise and
 * the same already-compromised precondition under which this first-party
 * local-source exception is accepted.
 *
 * REVISIT this exception if either changes: (a) the wizard gains a UI to set
 * the force-unsafe override, or (b) `trustedSourceLinkedOfficialInstall`
 * (already plumbed in cli/plugin-install-plan.ts) is consumed to scan-and-warn
 * for catalog-verified sources.
 */
function addPluginLoadPath(cfg: RemoteClawConfig, pluginPath: string): RemoteClawConfig {
  const existing = cfg.plugins?.load?.paths ?? [];
  const merged = Array.from(new Set([...existing, pluginPath]));
  return {
    ...cfg,
    plugins: {
      ...cfg.plugins,
      load: {
        ...cfg.plugins?.load,
        paths: merged,
      },
    },
  };
}

async function promptInstallChoice(params: {
  entry: ChannelPluginCatalogEntry;
  localPath?: string | null;
  defaultChoice: InstallChoice;
  prompter: WizardPrompter;
}): Promise<InstallChoice> {
  const { entry, localPath, prompter, defaultChoice } = params;
  const localOptions: Array<{ value: InstallChoice; label: string; hint?: string }> = localPath
    ? [
        {
          value: "local",
          label: "Use local plugin path",
          hint: localPath,
        },
      ]
    : [];
  const options: Array<{ value: InstallChoice; label: string; hint?: string }> = [
    { value: "npm", label: `Download from npm (${entry.install.npmSpec})` },
    ...localOptions,
    { value: "skip", label: "Skip for now" },
  ];
  const initialValue: InstallChoice =
    defaultChoice === "local" && !localPath ? "npm" : defaultChoice;
  return await prompter.select<InstallChoice>({
    message: `Install ${entry.meta.label} plugin?`,
    options,
    initialValue,
  });
}

function resolveInstallDefaultChoice(params: {
  cfg: RemoteClawConfig;
  entry: ChannelPluginCatalogEntry;
  localPath?: string | null;
  bundledLocalPath?: string | null;
}): InstallChoice {
  const { cfg, entry, localPath, bundledLocalPath } = params;
  if (bundledLocalPath) {
    return "local";
  }
  const updateChannel = cfg.update?.channel as string | undefined;
  if (updateChannel === "dev") {
    return localPath ? "local" : "npm";
  }
  if (updateChannel === "stable" || updateChannel === "beta") {
    return "npm";
  }
  const entryDefault = entry.install.defaultChoice;
  if (entryDefault === "local") {
    return localPath ? "local" : "npm";
  }
  if (entryDefault === "npm") {
    return "npm";
  }
  return localPath ? "local" : "npm";
}

export async function ensureOnboardingPluginInstalled(params: {
  cfg: RemoteClawConfig;
  entry: ChannelPluginCatalogEntry;
  prompter: WizardPrompter;
  runtime: RuntimeEnv;
  workspaceDir?: string;
}): Promise<InstallResult> {
  const { entry, prompter, runtime, workspaceDir } = params;
  let next = params.cfg;
  const allowLocal = hasGitWorkspace(workspaceDir);
  const bundledSources = resolveBundledPluginSources({ workspaceDir });
  const bundledLocalPath =
    resolveBundledInstallPlanForCatalogEntry({
      pluginId: entry.id,
      npmSpec: entry.install.npmSpec,
      findBundledSource: (lookup) =>
        findBundledPluginSourceInMap({ bundled: bundledSources, lookup }),
    })?.bundledSource.localPath ?? null;
  const localPath = bundledLocalPath ?? resolveLocalPath(entry, workspaceDir, allowLocal);
  const defaultChoice = resolveInstallDefaultChoice({
    cfg: next,
    entry,
    localPath,
    bundledLocalPath,
  });
  const choice = await promptInstallChoice({
    entry,
    localPath,
    defaultChoice,
    prompter,
  });

  if (choice === "skip") {
    return { cfg: next, installed: false };
  }

  if (choice === "local" && localPath) {
    // Local path registered without a code-safety scan by design — first-party
    // catalog/bundled source; see addPluginLoadPath and issue #2834.
    next = addPluginLoadPath(next, localPath);
    next = enablePluginInConfig(next, entry.id).config;
    return { cfg: next, installed: true };
  }

  const result = await installPluginFromNpmSpec({
    spec: entry.install.npmSpec,
    logger: {
      info: (msg) => runtime.log?.(msg),
      warn: (msg) => runtime.log?.(msg),
    },
  });

  if (result.ok) {
    next = enablePluginInConfig(next, result.pluginId).config;
    next = recordPluginInstall(next, {
      pluginId: result.pluginId,
      source: "npm",
      spec: entry.install.npmSpec,
      installPath: result.targetDir,
      version: result.version,
      ...buildNpmResolutionInstallFields(result.npmResolution),
    });
    return { cfg: next, installed: true };
  }

  await prompter.note(
    `Failed to install ${entry.install.npmSpec}: ${result.error}`,
    "Plugin install",
  );

  if (localPath) {
    const fallback = await prompter.confirm({
      message: `Use local plugin path instead? (${localPath})`,
      initialValue: true,
    });
    if (fallback) {
      // Local path registered without a code-safety scan by design — first-party
      // catalog/bundled source; see addPluginLoadPath and issue #2834.
      next = addPluginLoadPath(next, localPath);
      next = enablePluginInConfig(next, entry.id).config;
      return { cfg: next, installed: true };
    }
  }

  runtime.error?.(`Plugin install failed: ${result.error}`);
  return { cfg: next, installed: false };
}

export function reloadOnboardingPluginRegistry(params: {
  cfg: RemoteClawConfig;
  runtime: RuntimeEnv;
  workspaceDir?: string;
}): void {
  clearPluginDiscoveryCache();
  const workspaceDir =
    params.workspaceDir ?? resolveAgentWorkspaceDir(params.cfg, resolveDefaultAgentId(params.cfg));
  const log = createSubsystemLogger("plugins");
  loadRemoteClawPlugins({
    config: params.cfg,
    workspaceDir,
    cache: false,
    logger: createPluginLoaderLogger(log),
  });
}
