import { resolveAgentDir, resolveAgentWorkspaceDirOrNull } from "../agents/agent-scope.js";
import { upsertAuthProfile } from "../auth/index.js";
import { writeConfigFile } from "../config/config.js";
import { logConfigUpdated } from "../config/logging.js";
import { DEFAULT_AGENT_ID, normalizeAgentId } from "../routing/session-key.js";
import type { RuntimeEnv } from "../runtime.js";
import { defaultRuntime } from "../runtime.js";
import { resolveUserPath, shortenHomePath } from "../utils.js";
import { createClackPrompter } from "../wizard/clack-prompter.js";
import { WizardCancelledError } from "../wizard/prompts.js";
import {
  applyAgentBindings,
  buildChannelBindings,
  describeBinding,
  parseBindingSpecs,
} from "./agents.bindings.js";
import { createQuietRuntime, requireValidConfig } from "./agents.command-shared.js";
import { applyAgentConfig, findAgentEntryIndex, listAgentEntries } from "./agents.config.js";
import { setupChannels } from "./onboard-channels.js";
import { ensureWorkspaceAndSessions } from "./onboard-helpers.js";
import type { AgentRuntime, ChannelChoice } from "./onboard-types.js";

type AgentsAddOptions = {
  name?: string;
  workspace?: string;
  model?: string;
  agentDir?: string;
  bind?: string[];
  nonInteractive?: boolean;
  json?: boolean;
};

export async function agentsAddCommand(
  opts: AgentsAddOptions,
  runtime: RuntimeEnv = defaultRuntime,
  params?: { hasFlags?: boolean },
) {
  const cfg = await requireValidConfig(runtime);
  if (!cfg) {
    return;
  }

  const workspaceFlag = opts.workspace?.trim();
  const nameInput = opts.name?.trim();
  const hasFlags = params?.hasFlags === true;
  const nonInteractive = Boolean(opts.nonInteractive || hasFlags);

  if (nonInteractive && !workspaceFlag) {
    runtime.error(
      "Non-interactive mode requires --workspace. Re-run without flags to use the wizard.",
    );
    runtime.exit(1);
    return;
  }

  if (nonInteractive) {
    if (!nameInput) {
      runtime.error("Agent name is required in non-interactive mode.");
      runtime.exit(1);
      return;
    }
    if (!workspaceFlag) {
      runtime.error(
        "Non-interactive mode requires --workspace. Re-run without flags to use the wizard.",
      );
      runtime.exit(1);
      return;
    }
    const agentId = normalizeAgentId(nameInput);
    if (agentId === DEFAULT_AGENT_ID) {
      runtime.error(`"${DEFAULT_AGENT_ID}" is reserved. Choose another name.`);
      runtime.exit(1);
      return;
    }
    if (agentId !== nameInput) {
      runtime.log(`Normalized agent id to "${agentId}".`);
    }
    if (findAgentEntryIndex(listAgentEntries(cfg), agentId) >= 0) {
      runtime.error(`Agent "${agentId}" already exists.`);
      runtime.exit(1);
      return;
    }

    const workspaceDir = resolveUserPath(workspaceFlag);
    const agentDir = opts.agentDir?.trim()
      ? resolveUserPath(opts.agentDir.trim())
      : resolveAgentDir(cfg, agentId);
    const model = opts.model?.trim();
    const nextConfig = applyAgentConfig(cfg, {
      agentId,
      name: nameInput,
      workspace: workspaceDir,
      agentDir,
      ...(model ? { model } : {}),
    });

    const bindingParse = parseBindingSpecs({
      agentId,
      specs: opts.bind,
      config: nextConfig,
    });
    if (bindingParse.errors.length > 0) {
      runtime.error(bindingParse.errors.join("\n"));
      runtime.exit(1);
      return;
    }
    const bindingResult =
      bindingParse.bindings.length > 0
        ? applyAgentBindings(nextConfig, bindingParse.bindings)
        : { config: nextConfig, added: [], skipped: [], conflicts: [] };

    await writeConfigFile(bindingResult.config);
    if (!opts.json) {
      logConfigUpdated(runtime);
    }
    const quietRuntime = opts.json ? createQuietRuntime(runtime) : runtime;
    await ensureWorkspaceAndSessions(workspaceDir, quietRuntime, {
      agentId,
    });

    const payload = {
      agentId,
      name: nameInput,
      workspace: workspaceDir,
      agentDir,
      model,
      bindings: {
        added: bindingResult.added.map(describeBinding),
        skipped: bindingResult.skipped.map(describeBinding),
        conflicts: bindingResult.conflicts.map(
          (conflict) => `${describeBinding(conflict.binding)} (agent=${conflict.existingAgentId})`,
        ),
      },
    };
    if (opts.json) {
      runtime.log(JSON.stringify(payload, null, 2));
    } else {
      runtime.log(`Agent: ${agentId}`);
      runtime.log(`Workspace: ${shortenHomePath(workspaceDir)}`);
      runtime.log(`Agent dir: ${shortenHomePath(agentDir)}`);
      if (model) {
        runtime.log(`Model: ${model}`);
      }
      if (bindingResult.conflicts.length > 0) {
        runtime.error(
          [
            "Skipped bindings already claimed by another agent:",
            ...bindingResult.conflicts.map(
              (conflict) =>
                `- ${describeBinding(conflict.binding)} (agent=${conflict.existingAgentId})`,
            ),
          ].join("\n"),
        );
      }
    }
    return;
  }

  const prompter = createClackPrompter();
  try {
    await prompter.intro("Add RemoteClaw agent");
    const name =
      nameInput ??
      (await prompter.text({
        message: "Agent name",
        validate: (value) => {
          if (!value?.trim()) {
            return "Required";
          }
          const normalized = normalizeAgentId(value);
          if (normalized === DEFAULT_AGENT_ID) {
            return `"${DEFAULT_AGENT_ID}" is reserved. Choose another name.`;
          }
          return undefined;
        },
      }));

    const agentName = String(name ?? "").trim();
    let agentId = normalizeAgentId(agentName);
    if (agentName !== agentId) {
      const existingIds = new Set(listAgentEntries(cfg).map((a) => normalizeAgentId(a.id)));
      agentId = await prompter.text({
        message: "Agent id",
        initialValue: agentId,
        validate: (value) => {
          const trimmed = value.trim();
          if (!trimmed) {
            return "Required";
          }
          if (!/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(trimmed)) {
            return "Must start with a letter or digit and contain only letters, digits, hyphens, and underscores (max 64 chars).";
          }
          const normalized = trimmed.toLowerCase();
          if (normalized === DEFAULT_AGENT_ID) {
            return `"${DEFAULT_AGENT_ID}" is reserved. Choose another id.`;
          }
          if (existingIds.has(normalized)) {
            return `Agent "${normalized}" already exists.`;
          }
          return undefined;
        },
      });
      agentId = agentId.trim().toLowerCase();
    }

    const existingAgent = listAgentEntries(cfg).find(
      (agent) => normalizeAgentId(agent.id) === agentId,
    );
    if (existingAgent) {
      const shouldUpdate = await prompter.confirm({
        message: `Agent "${agentId}" already exists. Update it?`,
        initialValue: false,
      });
      if (!shouldUpdate) {
        await prompter.outro("No changes made.");
        return;
      }
    }

    const workspaceDefault = resolveAgentWorkspaceDirOrNull(cfg, agentId) ?? process.cwd();
    const workspaceInput = await prompter.text({
      message: "Workspace directory",
      initialValue: workspaceDefault,
      validate: (value) => (value?.trim() ? undefined : "Required"),
    });
    const workspaceDir = resolveUserPath(String(workspaceInput ?? "").trim() || workspaceDefault);
    const agentDir = resolveAgentDir(cfg, agentId);

    let nextConfig = applyAgentConfig(cfg, {
      agentId,
      name: agentName,
      workspace: workspaceDir,
      agentDir,
    });

    const wantsAuth = await prompter.confirm({
      message: "Configure model/auth for this agent now?",
      initialValue: false,
    });
    if (wantsAuth) {
      const selectedRuntime: AgentRuntime = await prompter.select({
        message: "Which agent runtime?",
        options: [
          { value: "claude", label: "Claude Code (claude)" },
          { value: "gemini", label: "Gemini CLI (gemini)" },
          { value: "codex", label: "Codex CLI (codex exec)" },
          { value: "opencode", label: "OpenCode (opencode)" },
        ],
        initialValue: "claude",
      });

      const promptApiKey = async (message: string) => {
        const key = await prompter.text({ message, initialValue: "" });
        return key.trim();
      };

      if (selectedRuntime === "claude") {
        const key = await promptApiKey("Anthropic API key (or leave empty to skip)");
        if (key) {
          upsertAuthProfile({
            profileId: "anthropic:default",
            credential: { type: "api_key", provider: "anthropic", key },
          });
        }
      } else if (selectedRuntime === "gemini") {
        const key = await promptApiKey("Gemini API key (or leave empty to skip)");
        if (key) {
          upsertAuthProfile({
            profileId: "google:default",
            credential: { type: "api_key", provider: "google", key },
          });
        }
      } else if (selectedRuntime === "codex") {
        const key = await promptApiKey("Codex API key (or leave empty to skip)");
        if (key) {
          upsertAuthProfile({
            profileId: "codex:default",
            credential: { type: "api_key", provider: "codex", key },
          });
        }
      } else if (selectedRuntime === "opencode") {
        const key = await promptApiKey("API key (or leave empty to skip)");
        if (key) {
          upsertAuthProfile({
            profileId: "opencode:default",
            credential: { type: "api_key", provider: "opencode", key },
          });
        }
      }

      nextConfig = applyAgentConfig(nextConfig, {
        agentId,
        runtime: selectedRuntime,
      });
    }

    let selection: ChannelChoice[] = [];
    const channelAccountIds: Partial<Record<ChannelChoice, string>> = {};
    nextConfig = await setupChannels(nextConfig, runtime, prompter, {
      allowSignalInstall: true,
      onSelection: (value) => {
        selection = value;
      },
      promptAccountIds: true,
      onAccountId: (channel, accountId) => {
        channelAccountIds[channel] = accountId;
      },
    });

    if (selection.length > 0) {
      const wantsBindings = await prompter.confirm({
        message: "Route selected channels to this agent now? (bindings)",
        initialValue: false,
      });
      if (wantsBindings) {
        const desiredBindings = buildChannelBindings({
          agentId,
          selection,
          config: nextConfig,
          accountIds: channelAccountIds,
        });
        const result = applyAgentBindings(nextConfig, desiredBindings);
        nextConfig = result.config;
        if (result.conflicts.length > 0) {
          await prompter.note(
            [
              "Skipped bindings already claimed by another agent:",
              ...result.conflicts.map(
                (conflict) =>
                  `- ${describeBinding(conflict.binding)} (agent=${conflict.existingAgentId})`,
              ),
            ].join("\n"),
            "Routing bindings",
          );
        }
      } else {
        await prompter.note(
          [
            "Routing unchanged. Add bindings when you're ready.",
            "Docs: https://docs.remoteclaw.org/concepts/multi-agent",
          ].join("\n"),
          "Routing",
        );
      }
    }

    await writeConfigFile(nextConfig);
    logConfigUpdated(runtime);
    await ensureWorkspaceAndSessions(workspaceDir, runtime, {
      agentId,
    });

    const payload = {
      agentId,
      name: agentName,
      workspace: workspaceDir,
      agentDir,
    };
    if (opts.json) {
      runtime.log(JSON.stringify(payload, null, 2));
    }
    await prompter.outro(`Agent "${agentId}" ready.`);
  } catch (err) {
    if (err instanceof WizardCancelledError) {
      runtime.exit(1);
      return;
    }
    throw err;
  }
}
