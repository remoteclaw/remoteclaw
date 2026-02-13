import { spawn } from "node:child_process";
import type { AgentRuntime } from "./agent-runtime.js";
import type { AgentDoneEvent, AgentEvent, AgentRuntimeParams, AgentUsage } from "./types.js";
import { classifyError } from "./error-classify.js";
import { parseLine } from "./event-extract.js";

export type CLIRuntimeConfig = {
  command: string;
  buildArgs: (params: AgentRuntimeParams) => string[];
  buildEnv: (params: AgentRuntimeParams) => Record<string, string>;
  buildStdin?: (params: AgentRuntimeParams) => string | undefined;
};

const SIGTERM_GRACE_MS = 5_000;

export abstract class CLIRuntimeBase implements AgentRuntime {
  abstract readonly name: string;
  protected abstract config(): CLIRuntimeConfig;

  async *execute(params: AgentRuntimeParams): AsyncIterable<AgentEvent> {
    const cfg = this.config();
    const startTime = Date.now();

    let accText = "";
    let accSessionId: string | undefined;
    let accUsage: AgentUsage | undefined;
    let aborted = false;
    let timedOut = false;
    let stderrChunks: string[] = [];

    const child = spawn(cfg.command, cfg.buildArgs(params), {
      cwd: params.workspaceDir,
      env: { ...process.env, ...cfg.buildEnv(params) },
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Write stdin if provided
    const stdinContent = cfg.buildStdin?.(params);
    if (stdinContent !== undefined) {
      child.stdin.write(stdinContent);
      child.stdin.end();
    } else {
      child.stdin.end();
    }

    // Abort handling
    const onAbort = () => {
      aborted = true;
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!child.killed) {
          child.kill("SIGKILL");
        }
      }, SIGTERM_GRACE_MS);
    };
    params.abortSignal?.addEventListener("abort", onAbort, { once: true });

    // Timeout handling
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (params.timeoutMs && params.timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, params.timeoutMs);
    }

    // Collect stderr
    child.stderr.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk.toString());
    });

    // Read stdout as NDJSON lines
    const events: AgentEvent[] = [];
    let remainder = "";

    child.stdout.on("data", (chunk: Buffer) => {
      remainder += chunk.toString();
      const lines = remainder.split("\n");
      remainder = lines.pop()!; // last element is partial or empty

      for (const line of lines) {
        const parsed = parseLine(line);
        if (!parsed) {
          continue;
        }

        if (parsed.sessionId !== undefined) {
          accSessionId = parsed.sessionId;
        }
        if (parsed.usage !== undefined) {
          accUsage = parsed.usage;
        }

        if (parsed.event) {
          if (parsed.event.type === "text") {
            accText += parsed.event.text;
          }
          events.push(parsed.event);
        }
      }
    });

    // Wait for process to exit
    const exitCode = await new Promise<number | null>((resolve) => {
      child.on("close", (code) => resolve(code));
    });

    // Process any remaining data in buffer
    if (remainder.trim()) {
      const parsed = parseLine(remainder);
      if (parsed) {
        if (parsed.sessionId !== undefined) {
          accSessionId = parsed.sessionId;
        }
        if (parsed.usage !== undefined) {
          accUsage = parsed.usage;
        }
        if (parsed.event) {
          if (parsed.event.type === "text") {
            accText += parsed.event.text;
          }
          events.push(parsed.event);
        }
      }
    }

    // Cleanup
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
    params.abortSignal?.removeEventListener("abort", onAbort);

    // Yield accumulated events
    for (const event of events) {
      yield event;
    }

    // Yield error event if needed
    if (aborted) {
      yield { type: "error", message: "Aborted by user", category: "aborted" };
    } else if (timedOut) {
      yield {
        type: "error",
        message: `Timed out after ${params.timeoutMs}ms`,
        category: "timeout",
      };
    } else if (exitCode !== 0 && exitCode !== null) {
      const stderrText = stderrChunks.join("").trim();
      const message = stderrText || `Process exited with code ${exitCode}`;
      const category = classifyError(message);
      yield { type: "error", message, category };
    }

    // Always yield done as final event
    const done: AgentDoneEvent = {
      type: "done",
      result: {
        text: accText,
        sessionId: accSessionId,
        durationMs: Date.now() - startTime,
        usage: accUsage,
        aborted: aborted || timedOut,
      },
    };
    yield done;
  }
}
