import { resolveCliNoOutputTimeoutMs } from "../agents/cli-runner/reliability.js";
import type { CliBackendConfig } from "../config/types.agent-defaults.js";
import type { CLIRuntimeConfig } from "./cli-runtime-base.js";
import { CLIRuntimeBase } from "./cli-runtime-base.js";
import { parseGeminiLine } from "./gemini-event-extract.js";
import type { AgentRuntimeParams } from "./types.js";

/** Exit code 53: Gemini CLI turn limit exceeded. */
const GEMINI_EXIT_TURN_LIMIT = 53;

export class GeminiCliRuntime extends CLIRuntimeBase {
  readonly name = "google-gemini-cli";

  private readonly backendConfig: CliBackendConfig | undefined;

  constructor(backendConfig?: CliBackendConfig) {
    super();
    this.backendConfig = backendConfig;
  }

  protected override resolveWatchdogMs(params: AgentRuntimeParams): number | undefined {
    return resolveCliNoOutputTimeoutMs({
      backend: this.backendConfig ?? { command: "gemini" },
      timeoutMs: params.timeoutMs ?? Number.MAX_SAFE_INTEGER,
      useResume: !!params.sessionId,
    });
  }

  protected config(): CLIRuntimeConfig {
    const bc = this.backendConfig;

    return {
      command: bc?.command ?? "gemini",
      parseLine: parseGeminiLine,
      classifyExitCode: (code: number, stderr: string) => {
        if (code === GEMINI_EXIT_TURN_LIMIT) {
          return {
            message: stderr || "Turn limit exceeded (exit code 53)",
            category: "fatal",
          };
        }
        return undefined;
      },
      buildArgs: (params: AgentRuntimeParams) => {
        // 1. Intrinsic args — required for correct I/O protocol
        const args = ["--output-format", "stream-json"];

        // 2. Config args — operator-provided extra args
        if (bc?.args) {
          args.push(...bc.args);
        }

        // 3. Per-invocation args — derived from AgentRuntimeParams
        if (params.model) {
          args.push("-m", params.model);
        }
        if (params.maxTurns !== undefined) {
          args.push("--max-turns", String(params.maxTurns));
        }
        if (params.sessionId) {
          args.push("-r", params.sessionId);
        }

        // 4. Prompt via -p flag (required for non-interactive mode)
        args.push("-p", params.prompt);

        return args;
      },
      buildEnv: (params: AgentRuntimeParams) => {
        const env: Record<string, string> = {};

        // Merge operator-provided env vars (config.env)
        if (bc?.env) {
          Object.assign(env, bc.env);
        }

        if (!params.auth) {
          return env;
        }
        switch (params.auth.mode) {
          case "api-key":
            env.GEMINI_API_KEY = params.auth.apiKey ?? "";
            break;
          case "token":
          case "aws-sdk":
            // GCP credentials are inherited from parent process env
            break;
        }
        return env;
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
