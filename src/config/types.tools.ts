// Stub type: exec-safe-bin-policy infrastructure was gutted.
type SafeBinProfileFixture = {
  minPositional?: number;
  maxPositional?: number;
  allowedValueFlags?: readonly string[];
  deniedFlags?: readonly string[];
};

type MediaProviderRequestConfig = {
  /** Optional provider-specific query params (merged into requests). */
  providerOptions?: Record<string, Record<string, string | number | boolean>>;
  /** @deprecated Use providerOptions.deepgram instead. */
  deepgram?: {
    detectLanguage?: boolean;
    punctuate?: boolean;
    smartFormat?: boolean;
  };
  /** Optional base URL override for provider requests. */
  baseUrl?: string;
  /** Optional headers merged into provider requests. */
  headers?: Record<string, string>;
};

export type MediaUnderstandingModelConfig = MediaProviderRequestConfig & {
  /** provider API id (e.g. openai, google). */
  provider?: string;
  /** Model id for provider-based understanding. */
  model?: string;
  /** Use a CLI command instead of provider API. */
  type?: "provider" | "cli";
  /** CLI binary (required when type=cli). */
  command?: string;
  /** CLI args (template-enabled). */
  args?: string[];
  /** Optional prompt override for this model entry. */
  prompt?: string;
  /** Optional max output characters for this model entry. */
  maxChars?: number;
  /** Optional max bytes for this model entry. */
  maxBytes?: number;
  /** Optional timeout override (seconds) for this model entry. */
  timeoutSeconds?: number;
  /** Optional language hint for audio transcription. */
  language?: string;
  /** Auth profile id to use for this provider. */
  profile?: string;
  /** Preferred profile id if multiple are available. */
  preferredProfile?: string;
};

export type MediaUnderstandingConfig = MediaProviderRequestConfig & {
  /** Enable media understanding when models are configured. */
  enabled?: boolean;
  /** Default max bytes to send. */
  maxBytes?: number;
  /** Default max output characters. */
  maxChars?: number;
  /** Default prompt. */
  prompt?: string;
  /** Default timeout (seconds). */
  timeoutSeconds?: number;
  /** Default language hint (audio). */
  language?: string;
  /** Ordered model list (fallbacks in order). */
  models?: MediaUnderstandingModelConfig[];
  /**
   * Echo the audio transcript back to the originating chat before agent processing.
   * Lets users verify what was heard. Default: false.
   */
  echoTranscript?: boolean;
  /**
   * Format string for the echoed transcript. Use `{transcript}` as placeholder.
   * Default: '📝 "{transcript}"'
   */
  echoFormat?: string;
};

export type MediaToolsConfig = {
  audio?: MediaUnderstandingConfig;
};

export type ToolProfileId = "minimal" | "coding" | "messaging" | "full";

export type SessionsToolsVisibility = "self" | "tree" | "agent" | "all";

export type ToolPolicyConfig = {
  allow?: string[];
  /**
   * Additional allowlist entries merged into the effective allowlist.
   *
   * Intended for additive configuration (e.g., "also allow crab") without forcing
   * users to replace/duplicate an existing allowlist or profile.
   */
  alsoAllow?: string[];
  deny?: string[];
  profile?: ToolProfileId;
};

export type GroupToolPolicyConfig = {
  allow?: string[];
  /** Additional allowlist entries merged into allow. */
  alsoAllow?: string[];
  deny?: string[];
};

export const TOOLS_BY_SENDER_KEY_TYPES = ["id", "e164", "username", "name"] as const;
export type ToolsBySenderKeyType = (typeof TOOLS_BY_SENDER_KEY_TYPES)[number];

export function parseToolsBySenderTypedKey(
  rawKey: string,
): { type: ToolsBySenderKeyType; value: string } | undefined {
  const trimmed = rawKey.trim();
  if (!trimmed) {
    return undefined;
  }
  const lowered = trimmed.toLowerCase();
  for (const type of TOOLS_BY_SENDER_KEY_TYPES) {
    const prefix = `${type}:`;
    if (!lowered.startsWith(prefix)) {
      continue;
    }
    return {
      type,
      value: trimmed.slice(prefix.length),
    };
  }
  return undefined;
}

/**
 * Per-sender overrides.
 *
 * Prefer explicit key prefixes:
 * - id:<senderId>
 * - e164:<phone>
 * - username:<handle>
 * - name:<display-name>
 * - * (wildcard)
 *
 * Legacy unprefixed keys are supported for backward compatibility and are matched as senderId only.
 */
export type GroupToolPolicyBySenderConfig = Record<string, GroupToolPolicyConfig>;

export type ExecToolConfig = {
  /** Exec host routing (default: sandbox). */
  host?: "sandbox" | "gateway" | "node";
  /** Exec security mode (default: deny). */
  security?: "deny" | "allowlist" | "full";
  /** Exec ask mode (default: on-miss). */
  ask?: "off" | "on-miss" | "always";
  /** Default node binding for exec.host=node (node id/name). */
  node?: string;
  /** Directories to prepend to PATH when running exec (gateway/sandbox). */
  pathPrepend?: string[];
  /** Safe stdin-only binaries that can run without allowlist entries. */
  safeBins?: string[];
  /** Extra explicit directories trusted for safeBins path checks (never derived from PATH). */
  safeBinTrustedDirs?: string[];
  /** Optional custom safe-bin profiles for entries in tools.exec.safeBins. */
  safeBinProfiles?: Record<string, SafeBinProfileFixture>;
  /** Default time (ms) before an exec command auto-backgrounds. */
  backgroundMs?: number;
  /** Default timeout (seconds) before auto-killing exec commands. */
  timeoutSec?: number;
  /** Emit a running notice (ms) when approval-backed exec runs long (default: 10000, 0 = off). */
  approvalRunningNoticeMs?: number;
  /** How long to keep finished sessions in memory (ms). */
  cleanupMs?: number;
  /** Emit a system event and heartbeat when a backgrounded exec exits. */
  notifyOnExit?: boolean;
  /**
   * Also emit success exit notifications when a backgrounded exec has no output.
   * Default false to reduce context noise.
   */
  notifyOnExitEmptySuccess?: boolean;
};

export type FsToolsConfig = {
  /**
   * Restrict filesystem tools to the agent workspace directory.
   * Default: false (unrestricted, matches legacy behavior).
   */
  workspaceOnly?: boolean;
};

export type AgentToolsConfig = {
  /** Base tool profile applied before allow/deny lists. */
  profile?: ToolProfileId;
  allow?: string[];
  /** Additional allowlist entries merged into allow and/or profile allowlist. */
  alsoAllow?: string[];
  deny?: string[];
  /** Optional tool policy overrides keyed by provider id or "provider/model". */
  byProvider?: Record<string, ToolPolicyConfig>;
  /** Exec tool defaults for this agent. */
  exec?: ExecToolConfig;
  /** Filesystem tool path guards. */
  fs?: FsToolsConfig;
  sandbox?: {
    tools?: {
      allow?: string[];
      deny?: string[];
    };
  };
};

export type ToolsConfig = {
  /** Base tool profile applied before allow/deny lists. */
  profile?: ToolProfileId;
  allow?: string[];
  /** Additional allowlist entries merged into allow and/or profile allowlist. */
  alsoAllow?: string[];
  deny?: string[];
  /** Optional tool policy overrides keyed by provider id or "provider/model". */
  byProvider?: Record<string, ToolPolicyConfig>;
  web?: {
    search?: {
      /** Enable web search tool (default: true when API key is present). */
      enabled?: boolean;
      /** Search provider ("brave", "perplexity", "grok", "gemini", or "kimi"). */
      provider?: "brave" | "perplexity" | "grok" | "gemini" | "kimi";
      /** Brave Search API key (optional; defaults to BRAVE_API_KEY env var). */
      apiKey?: SecretInput;
      /** Default search results count (1-10). */
      maxResults?: number;
      /** Timeout in seconds for search requests. */
      timeoutSeconds?: number;
      /** Cache TTL in minutes for search results. */
      cacheTtlMinutes?: number;
      /** Perplexity-specific configuration (used when provider="perplexity"). */
      perplexity?: {
        /** API key for Perplexity (defaults to PERPLEXITY_API_KEY env var). */
        apiKey?: SecretInput;
        /** @deprecated Legacy Sonar/OpenRouter field. Ignored by Search API. */
        baseUrl?: string;
        /** @deprecated Legacy Sonar/OpenRouter field. Ignored by Search API. */
        model?: string;
      };
      /** Grok-specific configuration (used when provider="grok"). */
      grok?: {
        /** API key for xAI (defaults to XAI_API_KEY env var). */
        apiKey?: SecretInput;
        /** Model to use (defaults to "grok-4-1-fast"). */
        model?: string;
        /** Include inline citations in response text as markdown links (default: false). */
        inlineCitations?: boolean;
      };
      /** Gemini-specific configuration (used when provider="gemini"). */
      gemini?: {
        /** Gemini API key (defaults to GEMINI_API_KEY env var). */
        apiKey?: SecretInput;
        /** Model to use for grounded search (defaults to "gemini-2.5-flash"). */
        model?: string;
      };
      /** Kimi-specific configuration (used when provider="kimi"). */
      kimi?: {
        /** Moonshot/Kimi API key (defaults to KIMI_API_KEY or MOONSHOT_API_KEY env var). */
        apiKey?: SecretInput;
        /** Base URL for API requests (defaults to "https://api.moonshot.ai/v1"). */
        baseUrl?: string;
        /** Model to use (defaults to "moonshot-v1-128k"). */
        model?: string;
      };
    };
    fetch?: {
      /** Enable web fetch tool (default: true). */
      enabled?: boolean;
      /** Max characters to return from fetched content. */
      maxChars?: number;
      /** Hard cap for maxChars (tool or config), defaults to 50000. */
      maxCharsCap?: number;
      /** Timeout in seconds for fetch requests. */
      timeoutSeconds?: number;
      /** Cache TTL in minutes for fetched content. */
      cacheTtlMinutes?: number;
      /** Maximum number of redirects to follow (default: 3). */
      maxRedirects?: number;
      /** Override User-Agent header for fetch requests. */
      userAgent?: string;
      /** Use Readability to extract main content (default: true). */
      readability?: boolean;
      firecrawl?: {
        /** Enable Firecrawl fallback (default: true when apiKey is set). */
        enabled?: boolean;
        /** Firecrawl API key (optional; defaults to FIRECRAWL_API_KEY env var). */
        apiKey?: string;
        /** Firecrawl base URL (default: https://api.firecrawl.dev). */
        baseUrl?: string;
        /** Whether to keep only main content (default: true). */
        onlyMainContent?: boolean;
        /** Max age (ms) for cached Firecrawl content. */
        maxAgeMs?: number;
        /** Timeout in seconds for Firecrawl requests. */
        timeoutSeconds?: number;
      };
    };
  };
  media?: MediaToolsConfig;
  /** Message tool configuration. */
  message?: {
    /**
     * @deprecated Use tools.message.crossContext settings.
     * Allows cross-context sends across providers.
     */
    allowCrossContextSend?: boolean;
    crossContext?: {
      /** Allow sends to other channels within the same provider (default: true). */
      allowWithinProvider?: boolean;
      /** Allow sends across different providers (default: false). */
      allowAcrossProviders?: boolean;
      /** Cross-context marker configuration. */
      marker?: {
        /** Enable origin markers for cross-context sends (default: true). */
        enabled?: boolean;
        /** Text prefix template, supports {channel}. */
        prefix?: string;
        /** Text suffix template, supports {channel}. */
        suffix?: string;
      };
    };
    broadcast?: {
      /** Enable broadcast action (default: true). */
      enabled?: boolean;
    };
  };
  agentToAgent?: {
    /** Enable agent-to-agent messaging tools. Default: false. */
    enabled?: boolean;
    /** Allowlist of agent ids or patterns (implementation-defined). */
    allow?: string[];
  };
  /**
   * Session tool visibility controls which sessions can be targeted by session tools
   * (sessions_list, sessions_history, sessions_send).
   *
   * Default: "tree" (current session + spawned subagent sessions).
   */
  sessions?: {
    /**
     * - "self": only the current session
     * - "tree": current session + sessions spawned by this session (default)
     * - "agent": any session belonging to the current agent id (can include other users)
     * - "all": any session (cross-agent still requires tools.agentToAgent)
     */
    visibility?: SessionsToolsVisibility;
  };
  /** Exec tool defaults. */
  exec?: ExecToolConfig;
  /** Filesystem tool path guards. */
  fs?: FsToolsConfig;
  /** Sub-agent tool policy defaults (deny wins). */
  subagents?: {
    /** Default model selection for spawned sub-agents (string or {primary,fallbacks}). */
    model?: string | { primary?: string; fallbacks?: string[] };
    tools?: {
      allow?: string[];
      /** Additional allowlist entries merged into allow and/or default sub-agent denylist. */
      alsoAllow?: string[];
      deny?: string[];
    };
  };
  /** Sandbox tool policy defaults (deny wins). */
  sandbox?: {
    tools?: {
      allow?: string[];
      deny?: string[];
    };
  };
};
