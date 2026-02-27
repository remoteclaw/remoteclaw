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
};
type SandboxBrowserSettings = {
  enabled?: boolean;
  image?: string;
  ports?: Array<string | number>;
};
type SandboxPruneSettings = {
  enabled?: boolean;
  maxAge?: string;
};

export type AgentModelConfig =
  | string
  | {
      /** Primary model (provider/model). */
      primary?: string;
      /** Per-agent model fallbacks (provider/model). */
      fallbacks?: string[];
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
