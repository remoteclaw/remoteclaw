import type { CLIRuntimeConfig } from "./cli-runtime-base.js";
import type { AgentRuntimeParams } from "./types.js";
import { CLIRuntimeBase } from "./cli-runtime-base.js";

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
      buildEnv: () => ({ CLAUDECODE: "" }),
      buildStdin: (params: AgentRuntimeParams) => {
        if (params.prompt.length > STDIN_THRESHOLD) {
          return params.prompt;
        }
        return undefined;
      },
    };
  }
}
