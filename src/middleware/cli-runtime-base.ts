import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { logDebug } from "../logger.js";
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

  /**
   * Compose the full prompt from structured parts (system + extra context + user).
   * Runtimes that support separate system prompt delivery (e.g. Claude) should
   * override or bypass this and handle the parts individually.
   */
  protected composePrompt(params: AgentExecuteParams): string {
    let composed = "";
    if (params.systemPrompt) {
      composed += params.systemPrompt;
    }
    if (params.extraContext) {
      composed += (composed ? "\n\n" : "") + params.extraContext;
    }
    composed += (composed ? "\n\n" : "") + params.prompt;
    return composed;
  }

  /**
   * Construct a custom stdin payload for the subprocess.
   * When this returns a string, it is written to stdin instead of
   * the default large-prompt fallback.  Subclasses may override.
   */
  protected buildStdinPayload(_params: AgentExecuteParams): string | undefined {
    return undefined;
  }

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
    const runtimeEnv = this.buildEnv(params);
    const callerEnv = params.env ?? {};
    const env = { ...process.env, ...runtimeEnv, ...callerEnv };

    logDebug(
      `[agent-runtime] spawn: ${this.command} ${args.map((a) => JSON.stringify(a)).join(" ")}`,
    );
    logDebug(`[agent-runtime] cwd: ${params.workingDirectory ?? process.cwd()}`);
    if (Object.keys(runtimeEnv).length > 0) {
      logDebug(`[agent-runtime] runtime env keys: ${Object.keys(runtimeEnv).join(", ")}`);
    }
    if (Object.keys(callerEnv).length > 0) {
      logDebug(`[agent-runtime] caller env keys: ${Object.keys(callerEnv).join(", ")}`);
    }

    const child = spawn(this.command, args, {
      cwd: params.workingDirectory,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    logDebug(`[agent-runtime] spawned pid=${child.pid}`);

    const startMs = Date.now();
    const stderrChunks: string[] = [];
    let aborted = false;
    let yieldedEvents = false;

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

    // ── Startup timeout ──────────────────────────────────────────────
    // One-shot timer: fires if no NDJSON output arrives before the
    // deadline.  Cancelled as soon as the first line is received.
    let startupTimer: ReturnType<typeof setTimeout> | undefined;
    let startupTimedOut = false;

    startupTimer = setTimeout(() => {
      startupTimedOut = true;
      logDebug(
        `[agent-runtime] pid=${child.pid}: startup timeout — no output within ${this.timeoutMs}ms`,
      );
      killWithEscalation();
    }, this.timeoutMs);

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
      if (startupTimer !== undefined) {
        clearTimeout(startupTimer);
        startupTimer = undefined;
      }
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
    const customStdin = this.buildStdinPayload(params);
    if (customStdin !== undefined && child.stdin) {
      logDebug(
        `[agent-runtime] pid=${child.pid}: delivering custom stdin payload (${customStdin.length} chars)`,
      );
      child.stdin.write(customStdin);
    } else if (this.supportsStdinPrompt && child.stdin) {
      const composedPrompt = this.composePrompt(params);
      if (composedPrompt.length > CLIRuntimeBase.STDIN_PROMPT_THRESHOLD) {
        logDebug(
          `[agent-runtime] pid=${child.pid}: delivering prompt via stdin (${composedPrompt.length} chars)`,
        );
        child.stdin.write(composedPrompt);
      }
    }
    // Always close stdin so CLIs that read from stdin get EOF and don't hang.
    child.stdin?.end();

    // ── Abort signal wiring (after event infrastructure is ready) ────
    const onAbort = () => {
      aborted = true;
      logDebug(`[agent-runtime] pid=${child.pid}: abort signal received`);
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
          yieldedEvents = true;
          yield event;
        }
      }
    } finally {
      if (startupTimer !== undefined) {
        clearTimeout(startupTimer);
      }
      params.abortSignal?.removeEventListener("abort", onAbort);
    }

    // ── Wait for process to fully exit ───────────────────────────────
    const { code: exitCode, signal: exitSignal } = await exitPromise;
    if (escalationTimer !== undefined) {
      clearTimeout(escalationTimer);
    }
    const durationMs = Date.now() - startMs;

    logDebug(
      `[agent-runtime] pid=${child.pid}: exited code=${exitCode} signal=${exitSignal} duration=${durationMs}ms`,
    );

    // ── Surface stderr when CLI exits with error ─────────────────────
    const stderr = stderrChunks.join("");
    if (stderr && (exitCode !== 0 || !yieldedEvents)) {
      yield {
        type: "error",
        message: stderr.trim(),
        code: "CLI_STDERR",
      } satisfies AgentErrorEvent;
    }

    // ── Fallback error for non-zero exit with no output ────────────────
    if (exitCode !== 0 && !yieldedEvents && !stderr) {
      yield {
        type: "error",
        message: `Agent process exited with code ${exitCode}`,
        code: "CLI_EXIT_ERROR",
      } satisfies AgentErrorEvent;
    }

    // ── Emit terminal events ─────────────────────────────────────────
    if (startupTimedOut) {
      yield {
        type: "error",
        message: `Startup timeout: no output within ${this.timeoutMs}ms`,
        code: "STARTUP_TIMEOUT",
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
      stderr: stderr || undefined,
    };

    yield { type: "done", result } satisfies AgentDoneEvent;
  }
}
