import type { CLIRuntimeConfig } from "./cli-runtime-base.js";
import { CLIRuntimeBase } from "./cli-runtime-base.js";
import type { AgentRuntimeParams } from "./types.js";

const STDIN_THRESHOLD = 10_000;

export class ClaudeCliRuntime extends CLIRuntimeBase {
  readonly name = "claude-cli";

  protected config(): CLIRuntimeConfig {
    return {
      command: "claude",
      buildArgs: (params: AgentRuntimeParams) => {
        const args = [
          "--print",
          "--output-format",
          "stream-json",
          "--verbose",
          "--dangerously-skip-permissions",
        ];

        if (params.model) {
          args.push("--model", params.model);
        }
        if (params.maxTurns !== undefined) {
          args.push("--max-turns", String(params.maxTurns));
        }
        if (params.sessionId) {
          args.push("--resume", params.sessionId);
        }

        // Short prompts go as positional arg; long ones via stdin
        if (params.prompt.length <= STDIN_THRESHOLD) {
          args.push(params.prompt);
        }

        return args;
      },
      buildEnv: (params: AgentRuntimeParams) => {
        // CLAUDECODE="" allows the CLI to run as a child instance (non-empty bails out).
        //
        // Auth env vars for the `claude` CLI subprocess:
        //   api-key     → ANTHROPIC_API_KEY          (standard Anthropic SDK key)
        //   oauth/token → CLAUDE_CODE_OAUTH_TOKEN    (Claude Code OAuth token)
        //
        // Note: ANTHROPIC_AUTH_TOKEN (Anthropic SDK Bearer token) is NOT used by
        // Claude Code — it uses its own CLAUDE_CODE_OAUTH_TOKEN instead.
        // ANTHROPIC_OAUTH_TOKEN is an RemoteClaw-internal env var for the gateway's
        // own auth resolution and is NOT recognized by the external `claude` binary.
        const env: Record<string, string> = { CLAUDECODE: "" };
        if (!params.auth) {
          return env;
        }
        switch (params.auth.mode) {
          case "api-key":
            env.ANTHROPIC_API_KEY = params.auth.apiKey ?? "";
            break;
          case "oauth":
          case "token":
            env.CLAUDE_CODE_OAUTH_TOKEN = params.auth.apiKey ?? "";
            break;
          case "aws-sdk":
            // Subprocess inherits parent AWS env vars
            break;
        }
        return env;
      },
      buildStdin: (params: AgentRuntimeParams) => {
        if (params.prompt.length > STDIN_THRESHOLD) {
          return params.prompt;
        }
        return undefined;
      },
    };
  }
}
