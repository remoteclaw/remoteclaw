// Upstream model config type (used across agent-defaults and agent types)
export type AgentModelConfig =
  | string
  | {
      /** Primary model (provider/model). */
      primary?: string;
      /** Per-agent model fallbacks (provider/model). */
      fallbacks?: string[];
      /** Optional provider request timeout in milliseconds for capabilities that support it. */
      timeoutMs?: number;
    };

// Sandbox infrastructure removed (#68)
type SandboxDockerSettings = {
  image?: string;
  network?: string;
  networkMode?: string;
  dns?: string[];
  env?: Record<string, string>;
  ports?: Array<string | number>;
  binds?: string[];
  memory?: string;
  cpus?: number;
  seccompProfile?: string;
  apparmorProfile?: string;
};
type SandboxBrowserSettings = {
  enabled?: boolean;
  image?: string;
  ports?: Array<string | number>;
  network?: string;
};
type SandboxPruneSettings = {
  enabled?: boolean;
  maxAge?: string;
};

export type AgentRuntimePolicyConfig = {
  /** Agent runtime id. Omitted uses "pi"; "auto" opts into plugin harness auto-selection. */
  id?: string;
  /** Fallback when no plugin harness matches or an auto-selected plugin harness fails. */
  fallback?: "pi" | "none";
};

export type AgentSandboxConfig = {
  mode?: "off" | "non-main" | "all";
  /** Agent workspace access inside the sandbox. */
  workspaceAccess?: "none" | "ro" | "rw";
  /**
   * Session tools visibility for sandboxed sessions.
   * - "spawned": only allow session tools to target sessions spawned from this session (default)
   * - "all": allow session tools to target any session
   */
  sessionToolsVisibility?: "spawned" | "all";
  /** Container/workspace scope for sandbox isolation. */
  scope?: "session" | "agent" | "shared";
  /** Legacy alias for scope ("session" when true, "shared" when false). */
  perSession?: boolean;
  workspaceRoot?: string;
  /** Docker-specific sandbox settings. */
  docker?: SandboxDockerSettings;
  /** Optional sandboxed browser settings. */
  browser?: SandboxBrowserSettings;
  /** Auto-prune sandbox settings. */
  prune?: SandboxPruneSettings;
};
