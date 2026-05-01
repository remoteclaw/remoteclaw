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

  /**
   * In-flight subprocess counts per CLI backend. Shared across all instances
   * of a given runtime so the gauge reflects total concurrency, not per-instance.
   */
  private static readonly inflightCounts = new Map<string, number>();

  constructor(
    /** CLI command name (e.g., "claude", "gemini", "codex", "opencode"). */
    protected readonly command: string,
    /** Subprocess timeout in milliseconds (default: 5 minutes). */
    protected readonly timeoutMs: number = 300_000,
  ) {}

  /**
   * Whether to sample subprocess RSS during in-flight execution.
   * Default `false`. Multi-process backends (Gemini/Codex/OpenCode) override
   * to `true`. Claude's per-session 1-process-per-turn model has different
   * topology, so RSS sampling is not applied there.
   */
  protected get shouldSampleRss(): boolean {
    return false;
  }

  /** RSS sampling interval in milliseconds (default 5s). */
  protected get rssSampleIntervalMs(): number {
    return 5_000;
  }

  /**
   * Emit a single structured metric line via the debug logger.
   *
   * Format: `[agent-runtime] metric=<name> backend=<cmd> value=<n> [extra=...]`
   *
   * Intentionally line-oriented and grep-aggregatable so no metrics backend
   * is required at the call site. See `src/middleware/README.md` for the
   * full metric vocabulary.
   */
  protected emitMetric(name: string, value: number, extras?: Record<string, string | number>): void {
    let line = `[agent-runtime] metric=${name} backend=${this.command} value=${value}`;
    if (extras) {
      for (const [k, v] of Object.entries(extras)) {
        line += ` ${k}=${v}`;
      }
    }
    logDebug(line);
  }

  /**
   * Run an MCP-config manager's `setup()` with timing instrumentation.
   * Emits the `mcp_config_setup_ms` metric on completion (success or failure).
   */
  protected async timedMcpSetup(manager: { setup(): Promise<void> } | null): Promise<void> {
    if (!manager) {
      return;
    }
    const start = Date.now();
    try {
      await manager.setup();
    } finally {
      this.emitMetric("mcp_config_setup_ms", Date.now() - start);
    }
  }

  /**
   * Run an MCP-config manager's `teardown()` with timing instrumentation.
   * Emits the `mcp_config_teardown_ms` metric on completion (always — teardown
   * is invoked from `finally` blocks even on the failure path).
   */
  protected async timedMcpTeardown(manager: { teardown(): Promise<void> } | null): Promise<void> {
    if (!manager) {
      return;
    }
    const start = Date.now();
    try {
      await manager.teardown();
    } finally {
      this.emitMetric("mcp_config_teardown_ms", Date.now() - start);
    }
  }

  /**
   * Sample resident set size of a child process via `ps -o rss= -p <pid>`.
   * Returns RSS in megabytes, or `undefined` if sampling failed (e.g., the
   * child has already exited or `ps` is unavailable on the host).
   */
  protected async sampleRssMb(pid: number): Promise<number | undefined> {
    return new Promise((resolve) => {
      const ps = spawn("ps", ["-o", "rss=", "-p", String(pid)], {
        stdio: ["ignore", "pipe", "ignore"],
      });
      let output = "";
      ps.stdout?.on("data", (chunk: Buffer) => {
        output += chunk.toString();
      });
      ps.on("close", () => {
        const rssKb = parseInt(output.trim(), 10);
        if (Number.isFinite(rssKb)) {
          resolve(rssKb / 1024);
        } else {
          resolve(undefined);
        }
      });
      ps.on("error", () => resolve(undefined));
    });
  }

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
    // Include thread context only on new sessions — on resume the CLI
    // already has conversation history, so injecting it again is redundant.
    if (params.threadContext && !params.sessionId) {
      composed += (composed ? "\n\n" : "") + params.threadContext;
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

    logDebug(`[agent-runtime] spawn: ${this.command} ${args.map((a) => JSON.stringify(a)).join(" ")}`);
    logDebug(`[agent-runtime] cwd: ${params.workingDirectory ?? process.cwd()}`);
    if (Object.keys(runtimeEnv).length > 0) {
      logDebug(`[agent-runtime] runtime env keys: ${Object.keys(runtimeEnv).join(", ")}`);
    }
    if (Object.keys(callerEnv).length > 0) {
      logDebug(`[agent-runtime] caller env keys: ${Object.keys(callerEnv).join(", ")}`);
    }

    // ── In-flight gauge: increment goes INSIDE the outer `try` so a
    //    synchronous throw from `spawn()` (rare — most spawn errors are
    //    async via `error` event, but invalid options can throw) still
    //    runs the decrement in the matching `finally`.
    let rssTimer: ReturnType<typeof setInterval> | undefined;

    try {
      const inflightAfterIncrement = (CLIRuntimeBase.inflightCounts.get(this.command) ?? 0) + 1;
      CLIRuntimeBase.inflightCounts.set(this.command, inflightAfterIncrement);
      this.emitMetric("inflight_subprocesses", inflightAfterIncrement);

      // Capture spawn-attempt timestamp BEFORE the spawn syscall so the
      // cold-start histogram includes process-creation cost.
      const spawnAtMs = Date.now();

      const child = spawn(this.command, args, {
        cwd: params.workingDirectory,
        env,
        stdio: ["pipe", "pipe", "pipe"],
      });

      logDebug(`[agent-runtime] spawned pid=${child.pid}`);

      const startMs = spawnAtMs;
      const stderrChunks: string[] = [];
      let aborted = false;
      let yieldedEvents = false;
      let coldStartEmitted = false;

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
        logDebug(`[agent-runtime] pid=${child.pid}: startup timeout — no output within ${this.timeoutMs}ms`);
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

        // Cold-start metric: emit on the first VALID NDJSON line, not any
        // raw readline event. This matches the README's "first NDJSON line"
        // contract and excludes leading blank lines or malformed garbage.
        if (!coldStartEmitted) {
          coldStartEmitted = true;
          this.emitMetric("cold_start_ms", Date.now() - spawnAtMs);
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
      const exitPromise = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
        child.on("exit", (code, signal) => {
          resolve({ code, signal });
        });
      });

      // ── Stdin prompt delivery ────────────────────────────────────────
      const customStdin = this.buildStdinPayload(params);
      if (customStdin !== undefined && child.stdin) {
        logDebug(`[agent-runtime] pid=${child.pid}: delivering custom stdin payload (${customStdin.length} chars)`);
        child.stdin.write(customStdin);
      } else if (this.supportsStdinPrompt && child.stdin) {
        const composedPrompt = this.composePrompt(params);
        if (composedPrompt.length > CLIRuntimeBase.STDIN_PROMPT_THRESHOLD) {
          logDebug(`[agent-runtime] pid=${child.pid}: delivering prompt via stdin (${composedPrompt.length} chars)`);
          child.stdin.write(composedPrompt);
        }
      }
      // Always close stdin so CLIs that read from stdin get EOF and don't hang.
      child.stdin?.end();

      // ── RSS sampling (multi-process backends only) ───────────────────
      if (this.shouldSampleRss && child.pid !== undefined) {
        const pid = child.pid;
        rssTimer = setInterval(() => {
          void this.sampleRssMb(pid).then((rssMb) => {
            if (rssMb !== undefined) {
              this.emitMetric("subprocess_rss_mb", rssMb, { pid });
            }
          });
        }, this.rssSampleIntervalMs);
      }

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
    } finally {
      // ── In-flight gauge: balanced decrement on every termination path ─
      //    (normal completion, exception, generator break, abort).
      if (rssTimer !== undefined) {
        clearInterval(rssTimer);
      }
      const next = (CLIRuntimeBase.inflightCounts.get(this.command) ?? 1) - 1;
      const clamped = Math.max(0, next);
      CLIRuntimeBase.inflightCounts.set(this.command, clamped);
      this.emitMetric("inflight_subprocesses", clamped);
    }
  }
}
