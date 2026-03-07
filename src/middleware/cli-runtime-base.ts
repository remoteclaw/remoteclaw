import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import type {
  AgentDoneEvent,
  AgentErrorEvent,
  AgentEvent,
  AgentExecuteParams,
  AgentRunResult,
  AgentRuntime,
} from "./types.js";

/**
 * Abstract base class encapsulating shared subprocess machinery for CLI-based agent runtimes.
 *
 * Concrete runtimes (Claude, Gemini, Codex, OpenCode) extend this and implement only
 * the CLI-specific parts: argument construction, event extraction, and environment setup.
 */
export abstract class CLIRuntimeBase implements AgentRuntime {
  /** Threshold above which prompts are delivered via stdin instead of CLI argument. */
  private static readonly STDIN_PROMPT_THRESHOLD = 10_000;

  constructor(
    /** CLI command name (e.g., "claude", "gemini", "codex", "opencode"). */
    protected readonly command: string,
    /** Subprocess timeout in milliseconds (default: 5 minutes). */
    protected readonly timeoutMs: number = 300_000,
  ) {}

  /** Construct CLI-specific command-line arguments. */
  protected abstract buildArgs(params: AgentExecuteParams): string[];

  /** Parse a single NDJSON line into an AgentEvent (or null to skip). */
  protected abstract extractEvent(line: string): AgentEvent | null;

  /** Construct provider-specific environment variables. */
  protected abstract buildEnv(params: AgentExecuteParams): Record<string, string>;

  /** Whether this CLI accepts prompts via stdin. Subclasses may override. */
  protected get supportsStdinPrompt(): boolean {
    return true;
  }

  /**
   * Which subprocess stream carries NDJSON output.
   * Defaults to `"stdout"`. Override to `"stderr"` for CLIs (like Claude)
   * that emit structured output on stderr.
   */
  protected get ndjsonStream(): "stdout" | "stderr" {
    return "stdout";
  }

  async *execute(params: AgentExecuteParams): AsyncIterable<AgentEvent> {
    const args = this.buildArgs(params);
    if (params.extraArgs && params.extraArgs.length > 0) {
      args.push(...params.extraArgs);
    }
    const env = { ...process.env, ...this.buildEnv(params), ...params.env };
    const child = spawn(this.command, args, {
      cwd: params.workingDirectory,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const startMs = Date.now();
    const stderrChunks: string[] = [];
    let aborted = false;

    // ── SIGKILL escalation helper ──────────────────────────────────────
    let escalationTimer: ReturnType<typeof setTimeout> | undefined;

    const killWithEscalation = () => {
      if (escalationTimer === undefined) {
        escalationTimer = setTimeout(() => {
          try {
            child.kill("SIGKILL");
          } catch {
            // Already dead — ignore
          }
        }, 1500);
      }
      child.kill("SIGTERM");
    };

    child.on("exit", () => {
      if (escalationTimer !== undefined) {
        clearTimeout(escalationTimer);
        escalationTimer = undefined;
      }
    });

    // ── Watchdog timer ───────────────────────────────────────────────
    let watchdogTimer: ReturnType<typeof setTimeout> | undefined;
    let watchdogFired = false;

    const resetWatchdog = () => {
      if (watchdogTimer !== undefined) {
        clearTimeout(watchdogTimer);
      }
      watchdogTimer = setTimeout(() => {
        watchdogFired = true;
        killWithEscalation();
      }, this.timeoutMs);
    };
    resetWatchdog();

    // ── Stream selection: NDJSON source + diagnostic capture ─────────
    const ndjsonSource = this.ndjsonStream === "stderr" ? child.stderr : child.stdout;
    const diagnosticStream = this.ndjsonStream === "stderr" ? child.stdout : child.stderr;

    diagnosticStream?.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk.toString());
    });

    // ── NDJSON parsing ─────────────────────────────────────────────
    const rl = createInterface({ input: ndjsonSource });

    // Buffer events from readline so the async generator can yield them.
    const eventQueue: (AgentEvent | null)[] = [];
    let resolveNext: (() => void) | undefined;
    let streamDone = false;

    const enqueue = (event: AgentEvent | null) => {
      eventQueue.push(event);
      resolveNext?.();
    };

    rl.on("line", (line) => {
      resetWatchdog();
      if (!line.trim()) {
        return;
      }

      try {
        JSON.parse(line);
      } catch {
        // Malformed line — skip (not fatal).
        return;
      }

      const event = this.extractEvent(line);
      if (event) {
        enqueue(event);
      }
    });

    rl.on("close", () => {
      streamDone = true;
      enqueue(null);
    });

    // ── Wait for subprocess exit (in parallel with event yielding) ───
    const exitPromise = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
      (resolve) => {
        child.on("exit", (code, signal) => {
          resolve({ code, signal });
        });
      },
    );

    // ── Stdin prompt delivery ────────────────────────────────────────
    if (
      this.supportsStdinPrompt &&
      params.prompt.length > CLIRuntimeBase.STDIN_PROMPT_THRESHOLD &&
      child.stdin
    ) {
      child.stdin.write(params.prompt);
    }
    // Always close stdin so CLIs that read from stdin get EOF and don't hang.
    child.stdin?.end();

    // ── Abort signal wiring (after event infrastructure is ready) ────
    const onAbort = () => {
      aborted = true;
      killWithEscalation();
    };
    if (params.abortSignal) {
      if (params.abortSignal.aborted) {
        aborted = true;
        killWithEscalation();
      } else {
        params.abortSignal.addEventListener("abort", onAbort, { once: true });
      }
    }

    // ── Yield events as they arrive ──────────────────────────────────
    try {
      while (!streamDone) {
        if (eventQueue.length === 0) {
          await new Promise<void>((resolve) => {
            resolveNext = resolve;
          });
        }

        while (eventQueue.length > 0) {
          const event = eventQueue.shift();
          if (event === null || event === undefined) {
            // Sentinel or empty — stdout closed.
            break;
          }
          yield event;
        }
      }
    } finally {
      if (watchdogTimer !== undefined) {
        clearTimeout(watchdogTimer);
      }
      params.abortSignal?.removeEventListener("abort", onAbort);
    }

    // ── Wait for process to fully exit ───────────────────────────────
    await exitPromise;
    if (escalationTimer !== undefined) {
      clearTimeout(escalationTimer);
    }
    const durationMs = Date.now() - startMs;

    // ── Emit terminal events ─────────────────────────────────────────
    if (watchdogFired) {
      yield {
        type: "error",
        message: `Watchdog timeout: no output for ${this.timeoutMs}ms`,
        code: "WATCHDOG_TIMEOUT",
      } satisfies AgentErrorEvent;
    }

    if (aborted) {
      yield {
        type: "error",
        message: "Execution aborted",
        code: "ABORTED",
      } satisfies AgentErrorEvent;
    }

    const result: AgentRunResult = {
      text: "",
      sessionId: undefined,
      durationMs,
      usage: undefined,
      aborted,
    };

    yield { type: "done", result } satisfies AgentDoneEvent;
  }
}
