import type { ChatType } from "../channels/chat-type.js";
import type { AgentDefaultsConfig } from "./types.agent-defaults.js";
import type { AgentSandboxConfig } from "./types.agents-shared.js";
import type { HumanDelayConfig, IdentityConfig } from "./types.base.js";
import type { GroupChatConfig } from "./types.messages.js";
import type { AgentToolsConfig } from "./types.tools.js";

export type AgentRuntimeAcpConfig = {
  /** ACP harness adapter id (for example codex, claude). */
  agent?: string;
  /** Optional ACP backend override for this agent runtime. */
  backend?: string;
  /** Optional ACP session mode override. */
  mode?: "persistent" | "oneshot";
  /** Optional runtime working directory override. */
  cwd?: string;
};

export type AgentRuntimeConfig =
  | {
      type: "embedded";
    }
  | {
      type: "acp";
      acp?: AgentRuntimeAcpConfig;
    };

export type AgentBindingMatch = {
  channel: string;
  accountId?: string;
  peer?: { kind: ChatType; id: string };
  guildId?: string;
  teamId?: string;
  /** Discord role IDs used for role-based routing. */
  roles?: string[];
};

export type AgentRouteBinding = {
  /** Missing type is interpreted as route for backward compatibility. */
  type?: "route";
  agentId: string;
  comment?: string;
  match: AgentBindingMatch;
};

export type AgentAcpBinding = {
  type: "acp";
  agentId: string;
  comment?: string;
  match: AgentBindingMatch;
  acp?: {
    mode?: "persistent" | "oneshot";
    label?: string;
    cwd?: string;
    backend?: string;
  };
};

export type AgentBinding = AgentRouteBinding | AgentAcpBinding;

export type AgentConfig = {
  id: string;
  default?: boolean;
  name?: string;
  workspace?: string;
  agentDir?: string;
  /** Human-like delay between block replies for this agent. */
  humanDelay?: HumanDelayConfig;
  /** Optional per-agent heartbeat overrides. */
  heartbeat?: AgentDefaultsConfig["heartbeat"];
  /** Optional per-agent boot prompt overrides. */
  boot?: AgentDefaultsConfig["boot"];
  identity?: IdentityConfig;
  groupChat?: GroupChatConfig;
  subagents?: {
    /** Allow spawning sub-agents under other agent ids. Use "*" to allow any. */
    allowAgents?: string[];
  };
  /** Optional per-agent sandbox overrides. */
  sandbox?: AgentSandboxConfig;
  /** Optional per-agent stream params (e.g. cacheRetention, temperature). */
  params?: Record<string, unknown>;
  /** Glob patterns for files exposed via agents.files.list/get/set. Per-agent overrides defaults. */
  editableFiles?: string[];
  tools?: AgentToolsConfig;
  /**
   * Auth profile(s) for credential injection.
   * - `false` — skip auth profile injection (rely on CLI-native auth / runtimeEnv / process.env)
   * - `"provider:profile"` — single profile, resolve key and inject as env var
   * - `["provider:key1", "provider:key2"]` — round-robin rotation across invocations
   * - `undefined` — inherit from `agents.defaults.auth`
   */
  auth?: false | string | string[];
  /** Selected agent runtime (claude, gemini, codex, opencode). Overrides `agents.defaults.runtime`. */
  runtime?: "claude" | "gemini" | "codex" | "opencode";
  /** Extra CLI arguments appended to runtime invocation. Replaces `agents.defaults.runtimeArgs`. */
  runtimeArgs?: string[];
  /** Extra environment variables injected into runtime invocation. Replaces `agents.defaults.runtimeEnv`. */
  runtimeEnv?: Record<string, string>;
};

export type AgentsConfig = {
  defaults?: AgentDefaultsConfig;
  list?: AgentConfig[];
};
