import { spawn } from "node:child_process";
import { logDebug } from "../logger.js";
import { maskSecret } from "../logging/redact.js";
import type { AgentRuntime } from "./agent-runtime.js";
import { classifyError } from "./error-classify.js";
import { parseLine } from "./event-extract.js";
import type { AgentDoneEvent, AgentEvent, AgentRuntimeParams, AgentUsage } from "./types.js";

export type CLIRuntimeConfig = {
  command: string;
  buildArgs: (params: AgentRuntimeParams) => string[];
  buildEnv: (params: AgentRuntimeParams) => Record<string, string>;
  buildStdin?: (params: AgentRuntimeParams) => string | undefined;
};

const SIGTERM_GRACE_MS = 5_000;

/**
 * Push-to-pull bridge: buffers items pushed from EventEmitter callbacks
 * and yields them via async iteration.
 */
function createAsyncQueue<T>(): {
  push: (value: T) => void;
  end: () => void;
  [Symbol.asyncIterator]: () => AsyncIterator<T>;
} {
  const buffer: T[] = [];
  let resolve: ((result: IteratorResult<T>) => void) | null = null;
  let done = false;

  return {
    push(value: T) {
      if (resolve) {
        const r = resolve;
        resolve = null;
        r({ value, done: false });
      } else {
        buffer.push(value);
      }
    },
    end() {
      done = true;
      if (resolve) {
        const r = resolve;
        resolve = null;
        r({ value: undefined as T, done: true });
      }
    },
    [Symbol.asyncIterator]() {
      return {
        next(): Promise<IteratorResult<T>> {
          if (buffer.length > 0) {
            return Promise.resolve({ value: buffer.shift()!, done: false });
          }
          if (done) {
            return Promise.resolve({ value: undefined as T, done: true });
          }
          return new Promise<IteratorResult<T>>((r) => {
            resolve = r;
          });
        },
      };
    },
  };
}

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
    let exitCode: number | null = null;
    const stderrChunks: string[] = [];

    const runtimeEnv = cfg.buildEnv(params);
    const safeAuth = params.auth
      ? {
          mode: params.auth.mode,
          source: params.auth.source,
          key: maskSecret(params.auth.apiKey ?? ""),
        }
      : null;
    const safeEnv = Object.fromEntries(
      Object.entries(runtimeEnv).map(([k, v]) => [k, maskSecret(v)]),
    );
    logDebug(`${this.name}: auth=${JSON.stringify(safeAuth)} env=${JSON.stringify(safeEnv)}`);

    const child = spawn(cfg.command, cfg.buildArgs(params), {
      cwd: params.workspaceDir,
      env: { ...process.env, ...runtimeEnv },
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

    // Bridge stdout events into an async queue for real-time streaming
    const queue = createAsyncQueue<AgentEvent>();
    let remainder = "";

    const processLine = (line: string) => {
      const parsed = parseLine(line);
      if (!parsed) {
        return;
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
        queue.push(parsed.event);
      }
    };

    child.stdout.on("data", (chunk: Buffer) => {
      remainder += chunk.toString();
      const lines = remainder.split("\n");
      remainder = lines.pop()!; // last element is partial or empty

      for (const line of lines) {
        processLine(line);
      }
    });

    child.on("close", (code) => {
      exitCode = code;

      // Flush any remaining partial line
      if (remainder.trim()) {
        processLine(remainder);
      }

      queue.end();
    });

    // Yield events in real-time as they arrive
    for await (const event of queue) {
      yield event;
    }

    // Cleanup
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
    params.abortSignal?.removeEventListener("abort", onAbort);

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
      const message = stderrText || `Process exited with code ${String(exitCode)}`;
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
