import { resolveCliNoOutputTimeoutMs } from "../agents/cli-runner/reliability.js";
import type { CliBackendConfig } from "../config/types.agent-defaults.js";
import type { CLIRuntimeConfig } from "./cli-runtime-base.js";
import { CLIRuntimeBase } from "./cli-runtime-base.js";
import { parseOpenCodeLine } from "./opencode-event-extract.js";
import type { AgentRuntimeParams } from "./types.js";

const STDIN_THRESHOLD = 10_000;

export class OpenCodeCliRuntime extends CLIRuntimeBase {
  readonly name = "opencode";

  private readonly backendConfig: CliBackendConfig | undefined;

  constructor(backendConfig?: CliBackendConfig) {
    super();
    this.backendConfig = backendConfig;
  }

  protected override resolveWatchdogMs(params: AgentRuntimeParams): number | undefined {
    return resolveCliNoOutputTimeoutMs({
      backend: this.backendConfig ?? { command: "opencode" },
      timeoutMs: params.timeoutMs ?? Number.MAX_SAFE_INTEGER,
      useResume: !!params.sessionId,
    });
  }

  protected config(): CLIRuntimeConfig {
    const bc = this.backendConfig;

    return {
      command: bc?.command ?? "opencode",
      parseLine: parseOpenCodeLine,
      buildArgs: (params: AgentRuntimeParams) => {
        // 1. Intrinsic args — required for correct I/O protocol
        //    --format json  → NDJSON output
        //    --quiet        → suppress spinner, keep JSON intact
        const args = ["--format", "json", "--quiet"];

        // 2. Config args — operator-provided extra args
        if (bc?.args) {
          args.push(...bc.args);
        }

        // 3. Per-invocation args — derived from AgentRuntimeParams
        if (params.model) {
          args.push("--model", params.model);
        }
        // OpenCode uses --session to resume a specific session
        if (params.sessionId) {
          args.push("--session", params.sessionId);
        }
        // OpenCode does not expose a --max-turns flag

        // 4. Prompt — named flag --prompt (not positional)
        if (params.prompt.length <= STDIN_THRESHOLD) {
          args.push("--prompt", params.prompt);
        }

        return args;
      },
      buildEnv: (params: AgentRuntimeParams) => {
        const env: Record<string, string> = {};

        // Merge operator-provided env vars
        if (bc?.env) {
          Object.assign(env, bc.env);
        }

        if (!params.auth) {
          return env;
        }

        // OpenCode is multi-provider; auth env vars depend on the target provider.
        // For the common case, pass ANTHROPIC_API_KEY or OPENAI_API_KEY.
        // The specific key to set is determined by the auth mode or config.
        switch (params.auth.mode) {
          case "api-key":
            env.ANTHROPIC_API_KEY = params.auth.apiKey ?? "";
            break;
          case "token":
            // OpenCode doesn't have a direct token env var like Claude;
            // pass as ANTHROPIC_API_KEY as fallback
            env.ANTHROPIC_API_KEY = params.auth.apiKey ?? "";
            break;
          case "aws-sdk":
            // Subprocess inherits parent AWS env vars
            break;
        }
        return env;
      },
      buildStdin: (params: AgentRuntimeParams) => {
        // For long prompts, write to stdin and omit --prompt from args
        if (params.prompt.length > STDIN_THRESHOLD) {
          return params.prompt;
        }
        return undefined;
      },
    };
  }

  protected override buildProcessEnv(runtimeEnv: Record<string, string>): Record<string, string> {
    if (!this.backendConfig?.clearEnv?.length) {
      return super.buildProcessEnv(runtimeEnv);
    }
    const base = { ...process.env } as Record<string, string>;
    for (const key of this.backendConfig.clearEnv) {
      delete base[key];
    }
    return { ...base, ...runtimeEnv };
  }
}
