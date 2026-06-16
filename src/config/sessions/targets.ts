import fsSync from "node:fs";
import path from "node:path";
import { listAgentIds, resolveDefaultAgentId } from "../../agents/agent-scope.js";
import { resolveAgentSessionDirsFromAgentsDirSync } from "../../agents/session-dirs.js";
import { normalizeAgentId } from "../../routing/session-key.js";
import { resolveStateDir } from "../paths.js";
import type { RemoteClawConfig } from "../types.remoteclaw.js";
import { resolveAgentsDirFromSessionStorePath, resolveStorePath } from "./paths.js";

export type SessionStoreTarget = {
  agentId: string;
  storePath: string;
};

const NON_FATAL_DISCOVERY_ERROR_CODES = new Set([
  "EACCES",
  "ELOOP",
  "ENOENT",
  "ENOTDIR",
  "EPERM",
  "ESTALE",
]);

function dedupeTargetsByStorePath(targets: SessionStoreTarget[]): SessionStoreTarget[] {
  const deduped = new Map<string, SessionStoreTarget>();
  for (const target of targets) {
    if (!deduped.has(target.storePath)) {
      deduped.set(target.storePath, target);
    }
  }
  return [...deduped.values()];
}

function shouldSkipDiscoveryError(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException | undefined)?.code;
  return typeof code === "string" && NON_FATAL_DISCOVERY_ERROR_CODES.has(code);
}

function isWithinRoot(realPath: string, realRoot: string): boolean {
  return realPath === realRoot || realPath.startsWith(`${realRoot}${path.sep}`);
}

function shouldSkipDiscoveredAgentDirName(
  dirName: string,
  agentId: string,
  defaultAgentId: string,
): boolean {
  // Avoid collapsing arbitrary directory names like "###" into the default agent.
  // Human-friendly names like "Retired Agent" are still allowed because they normalize to
  // a non-default stable id and preserve the intended retired-store discovery behavior.
  return agentId === defaultAgentId && dirName.trim().toLowerCase() !== defaultAgentId;
}

function resolveValidatedDiscoveredStorePathSync(params: {
  sessionsDir: string;
  agentsRoot: string;
  realAgentsRoot?: string;
}): string | undefined {
  const storePath = path.join(params.sessionsDir, "sessions.json");
  try {
    const stat = fsSync.lstatSync(storePath);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      return undefined;
    }
    const realStorePath = fsSync.realpathSync.native(storePath);
    const realAgentsRoot = params.realAgentsRoot ?? fsSync.realpathSync.native(params.agentsRoot);
    return isWithinRoot(realStorePath, realAgentsRoot) ? realStorePath : undefined;
  } catch (err) {
    if (shouldSkipDiscoveryError(err)) {
      return undefined;
    }
    throw err;
  }
}

function resolveSessionStoreDiscoveryState(
  cfg: RemoteClawConfig,
  env: NodeJS.ProcessEnv,
): {
  configuredTargets: SessionStoreTarget[];
  agentsRoots: string[];
} {
  const configuredTargets = resolveAllConfiguredAgentSessionStoreTargets(cfg, { env });
  const agentsRoots = new Set<string>();
  for (const target of configuredTargets) {
    const agentsDir = resolveAgentsDirFromSessionStorePath(target.storePath);
    if (agentsDir) {
      agentsRoots.add(agentsDir);
    }
  }
  agentsRoots.add(path.join(resolveStateDir(env), "agents"));
  return {
    configuredTargets,
    agentsRoots: [...agentsRoots],
  };
}

function toDiscoveredSessionStoreTarget(
  sessionsDir: string,
  storePath: string,
  defaultAgentId: string,
): SessionStoreTarget | undefined {
  const dirName = path.basename(path.dirname(sessionsDir));
  const agentId = normalizeAgentId(dirName);
  if (shouldSkipDiscoveredAgentDirName(dirName, agentId, defaultAgentId)) {
    return undefined;
  }
  return {
    agentId,
    // Keep the actual on-disk store path so retired/manual agent dirs remain discoverable
    // even if their directory name no longer round-trips through normalizeAgentId().
    storePath,
  };
}

/**
 * Configured session-store targets for every agent listed in config.
 * Returns the default agent's store when no agents are configured so the
 * discovery walk always has a baseline root to scan.
 */
function resolveAllConfiguredAgentSessionStoreTargets(
  cfg: RemoteClawConfig,
  params: { env?: NodeJS.ProcessEnv } = {},
): SessionStoreTarget[] {
  const env = params.env ?? process.env;
  const agentIds = listAgentIds(cfg);
  const ids = agentIds.length > 0 ? agentIds : [resolveDefaultAgentId(cfg)];
  const targets = ids.map((agentId) => ({
    agentId,
    storePath: resolveStorePath(cfg.session?.store, { agentId, env }),
  }));
  return dedupeTargetsByStorePath(targets);
}

/**
 * Resolve every backing session-store target for the gateway: the configured
 * per-agent stores plus any retired/manual agent stores discovered on disk.
 * Discovered stores keep their real on-disk path (symlinks resolved, scoped to
 * the agents root) so retired agents whose directory name no longer round-trips
 * through normalizeAgentId() stay visible (#32804).
 */
export function resolveAllAgentSessionStoreTargetsSync(
  cfg: RemoteClawConfig,
  params: { env?: NodeJS.ProcessEnv } = {},
): SessionStoreTarget[] {
  const env = params.env ?? process.env;
  const { configuredTargets, agentsRoots } = resolveSessionStoreDiscoveryState(cfg, env);
  const defaultAgentId = resolveDefaultAgentId(cfg);
  const realAgentsRoots = new Map<string, string>();
  const getRealAgentsRoot = (agentsRoot: string): string | undefined => {
    const cached = realAgentsRoots.get(agentsRoot);
    if (cached !== undefined) {
      return cached;
    }
    try {
      const realAgentsRoot = fsSync.realpathSync.native(agentsRoot);
      realAgentsRoots.set(agentsRoot, realAgentsRoot);
      return realAgentsRoot;
    } catch (err) {
      if (shouldSkipDiscoveryError(err)) {
        return undefined;
      }
      throw err;
    }
  };
  const validatedConfiguredTargets = configuredTargets.flatMap((target) => {
    const agentsRoot = resolveAgentsDirFromSessionStorePath(target.storePath);
    if (!agentsRoot) {
      return [target];
    }
    const realAgentsRoot = getRealAgentsRoot(agentsRoot);
    if (!realAgentsRoot) {
      return [];
    }
    const validatedStorePath = resolveValidatedDiscoveredStorePathSync({
      sessionsDir: path.dirname(target.storePath),
      agentsRoot,
      realAgentsRoot,
    });
    return validatedStorePath ? [{ ...target, storePath: validatedStorePath }] : [];
  });
  const discoveredTargets = agentsRoots.flatMap((agentsDir) => {
    try {
      const realAgentsRoot = getRealAgentsRoot(agentsDir);
      if (!realAgentsRoot) {
        return [];
      }
      return resolveAgentSessionDirsFromAgentsDirSync(agentsDir).flatMap((sessionsDir) => {
        const validatedStorePath = resolveValidatedDiscoveredStorePathSync({
          sessionsDir,
          agentsRoot: agentsDir,
          realAgentsRoot,
        });
        const target = validatedStorePath
          ? toDiscoveredSessionStoreTarget(sessionsDir, validatedStorePath, defaultAgentId)
          : undefined;
        return target ? [target] : [];
      });
    } catch (err) {
      if (shouldSkipDiscoveryError(err)) {
        return [];
      }
      throw err;
    }
  });
  return dedupeTargetsByStorePath([...validatedConfiguredTargets, ...discoveredTargets]);
}
