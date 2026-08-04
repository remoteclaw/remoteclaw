import path from "node:path";
import { resolveAgentDir, resolveAgentWorkspaceDir } from "../agents/agent-scope.js";
import { writeConfigFile } from "../config/config.js";
import { logConfigUpdated } from "../config/logging.js";
import { resolveSessionTranscriptsDirForAgent } from "../config/sessions.js";
import { resolveOwnedStateRoots } from "../config/trash-roots.js";
import { normalizeAgentId } from "../routing/session-key.js";
import type { RuntimeEnv } from "../runtime.js";
import { defaultRuntime } from "../runtime.js";
import { createClackPrompter } from "../wizard/clack-prompter.js";
import { createQuietRuntime, requireValidConfig } from "./agents.command-shared.js";
import { findAgentEntryIndex, listAgentEntries, pruneAgentConfig } from "./agents.config.js";
import { moveToTrash } from "./onboard-helpers.js";

type AgentsDeleteOptions = {
  id: string;
  force?: boolean;
  json?: boolean;
};

export async function agentsDeleteCommand(
  opts: AgentsDeleteOptions,
  runtime: RuntimeEnv = defaultRuntime,
) {
  const cfg = await requireValidConfig(runtime);
  if (!cfg) {
    return;
  }

  const input = opts.id?.trim();
  if (!input) {
    runtime.error("Agent id is required.");
    runtime.exit(1);
    return;
  }

  const agentId = normalizeAgentId(input);
  if (agentId !== input) {
    runtime.log(`Normalized agent id to "${agentId}".`);
  }

  if (findAgentEntryIndex(listAgentEntries(cfg), agentId) < 0) {
    runtime.error(`Agent "${agentId}" not found.`);
    runtime.exit(1);
    return;
  }

  if (!opts.force) {
    if (!process.stdin.isTTY) {
      runtime.error("Non-interactive session. Re-run with --force.");
      runtime.exit(1);
      return;
    }
    const prompter = createClackPrompter();
    const confirmed = await prompter.confirm({
      message: `Delete agent "${agentId}" and prune agent state?`,
      initialValue: false,
    });
    if (!confirmed) {
      runtime.log("Cancelled.");
      return;
    }
  }

  const workspaceDir = resolveAgentWorkspaceDir(cfg, agentId);
  const agentDir = resolveAgentDir(cfg, agentId);
  const sessionsDir = resolveSessionTranscriptsDirForAgent(agentId);

  const result = pruneAgentConfig(cfg, agentId);
  await writeConfigFile(result.config);
  if (!opts.json) {
    logConfigUpdated(runtime);
  }

  const quietRuntime = opts.json ? createQuietRuntime(runtime) : runtime;
  // The workspace directory is user-owned — a project/git dir the user points
  // RemoteClaw at, which RemoteClaw never created. Deleting an agent must NOT
  // trash it. Only remove RemoteClaw-owned state (agent dir + session transcripts).
  //
  // `agentDir` is config-declared (`agents.<id>.agentDir`) and may point outside
  // every owned root, so its declared parent is admitted too; the containment
  // check still rejects an agentDir that is a symlink escaping that parent.
  // `sessionsDir` is always under the state dir, so the owned roots suffice.
  const ownedRoots = resolveOwnedStateRoots();
  await moveToTrash(agentDir, quietRuntime, {
    allowedRoots: [...ownedRoots, path.dirname(path.resolve(agentDir))],
  });
  await moveToTrash(sessionsDir, quietRuntime, { allowedRoots: ownedRoots });

  if (opts.json) {
    runtime.log(
      JSON.stringify(
        {
          agentId,
          workspace: workspaceDir,
          workspacePreserved: true,
          agentDir,
          sessionsDir,
          removedBindings: result.removedBindings,
          removedAllow: result.removedAllow,
        },
        null,
        2,
      ),
    );
  } else {
    runtime.log(`Deleted agent: ${agentId}`);
  }
}
