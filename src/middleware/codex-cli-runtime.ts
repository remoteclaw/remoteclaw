import { resolveCliNoOutputTimeoutMs } from "../agents/cli-runner/reliability.js";
import type { CliBackendConfig } from "../config/types.agent-defaults.js";
import type { CLIRuntimeConfig } from "./cli-runtime-base.js";
import { CLIRuntimeBase } from "./cli-runtime-base.js";
import { parseCodexLine } from "./codex-event-extract.js";
import type { AgentRuntimeParams } from "./types.js";

export class CodexCliRuntime extends CLIRuntimeBase {
  readonly name = "codex-cli";

  private readonly backendConfig: CliBackendConfig | undefined;

  constructor(backendConfig?: CliBackendConfig) {
    super();
    this.backendConfig = backendConfig;
  }

  protected override resolveWatchdogMs(params: AgentRuntimeParams): number | undefined {
    return resolveCliNoOutputTimeoutMs({
      backend: this.backendConfig ?? { command: "codex" },
      timeoutMs: params.timeoutMs ?? Number.MAX_SAFE_INTEGER,
      useResume: !!params.sessionId,
    });
  }

  protected config(): CLIRuntimeConfig {
    const bc = this.backendConfig;

    return {
      command: bc?.command ?? "codex",
      parseLine: parseCodexLine,
      buildArgs: (params: AgentRuntimeParams) => {
        // 1. Subcommand — always "exec"; resume uses positional verb
        const args = ["exec"];
        if (params.sessionId) {
          args.push("resume", params.sessionId);
        }

        // 2. Intrinsic args — required for correct NDJSON output
        args.push("--json", "--color", "never");

        // 3. Config args — operator-provided extra args (e.g. --sandbox, --skip-git-repo-check)
        if (bc?.args) {
          args.push(...bc.args);
        }

        // 4. Per-invocation args — derived from AgentRuntimeParams
        if (params.model) {
          args.push("-m", params.model);
        }

        // 5. Prompt — positional arg (fresh runs only; resume has no prompt)
        if (!params.sessionId) {
          args.push(params.prompt);
        }

        return args;
      },
      buildEnv: (params: AgentRuntimeParams) => {
        const env: Record<string, string> = {};

        // Merge operator-provided env vars (config.env)
        if (bc?.env) {
          Object.assign(env, bc.env);
        }

        // Auth — Codex uses OPENAI_API_KEY
        if (params.auth?.mode === "api-key" && params.auth.apiKey) {
          env.OPENAI_API_KEY = params.auth.apiKey;
        }

        return env;
      },
    };
  }

  protected override buildProcessEnv(runtimeEnv: Record<string, string>): Record<string, string> {
    const base = { ...process.env } as Record<string, string>;
    // Always clear Anthropic key to prevent cross-contamination
    delete base.ANTHROPIC_API_KEY;
    // Clear any additional keys specified in config
    if (this.backendConfig?.clearEnv?.length) {
      for (const key of this.backendConfig.clearEnv) {
        delete base[key];
      }
    }
    return { ...base, ...runtimeEnv };
  }
}
