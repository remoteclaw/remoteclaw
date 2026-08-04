// Spawns an isolated RemoteClaw gateway process against a throwaway home for e2e tests.
//
// Fork-native, deliberately minimal: it covers exactly the surface
// `gateway-e2e-harness.ts` consumes. Upstream's `openclaw-test-instance.ts` is NOT
// portable here — it builds on `src/test-utils/openclaw-test-state.ts`, which imports
// `src/state/*` and `src/agents/auth-profiles/sqlite.js`. This fork has no `src/state/`
// directory at all, so adopting it would mean porting a gutted subsystem (#3080).
import { type ChildProcessByStdio, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import type { Readable } from "node:stream";
import { sleep } from "../../src/utils.js";
import { createBoundedChildOutput } from "./bounded-child-output.js";

const GATEWAY_START_TIMEOUT_MS = 60_000;
const GATEWAY_STOP_TIMEOUT_MS = 10_000;
const GATEWAY_READY_POLL_MS = 25;
const GATEWAY_READY_PROBE_TIMEOUT_MS = 1_000;

type BoundedOutput = ReturnType<typeof createBoundedChildOutput>;
type TestChildProcess = ChildProcessByStdio<null, Readable, Readable>;

export type RemoteClawTestInstanceOptions = {
  name: string;
  cwd?: string;
  port?: number;
  gatewayToken?: string;
  hookToken?: string;
  /** Merged over the generated gateway/hooks config before it is written to disk. */
  config?: Record<string, unknown>;
  env?: Record<string, string | undefined>;
  gatewayArgs?: string[];
  startTimeoutMs?: number;
  stopTimeoutMs?: number;
};

export type RemoteClawTestInstance = {
  name: string;
  port: number;
  url: string;
  hookToken: string;
  gatewayToken: string;
  homeDir: string;
  stateDir: string;
  configPath: string;
  env: NodeJS.ProcessEnv;
  startGateway: () => Promise<void>;
  stopGateway: () => Promise<void>;
  logs: () => string;
  cleanup: () => Promise<void>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeConfig(
  base: Record<string, unknown>,
  override: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!override) {
    return base;
  }
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const existing = result[key];
    result[key] = isRecord(existing) && isRecord(value) ? mergeConfig(existing, value) : value;
  }
  return result;
}

async function getFreePort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    throw new Error("failed to bind an ephemeral port");
  }
  const { port } = address;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

/**
 * Prefers a `dist/` build; falls back to the source runner so an unbuilt tree still works.
 *
 * Upstream additionally requires `dist/.buildstamp` + `dist/.runtime-postbuildstamp` to guard
 * against a partial build. That check is NOT replicated here: this fork's `pnpm build` invokes
 * neither `scripts/build-stamp.mjs` nor `scripts/runtime-postbuild-stamp.mjs`, so both stamps are
 * always absent and the condition would never be true — a dead branch that silently forces the
 * fallback. Verified: `pnpm build` exits 0 and writes `dist/index.js` with neither stamp present.
 */
async function resolveGatewayEntrypoint(cwd: string): Promise<string[]> {
  for (const entrypoint of ["dist/index.js", "dist/index.mjs"]) {
    try {
      await fs.access(path.join(cwd, entrypoint));
      return [entrypoint];
    } catch {
      // Try the next built entrypoint, then fall through to the source runner.
    }
  }
  return ["scripts/run-node.mjs"];
}

function useProcessGroup(): boolean {
  return process.platform !== "win32";
}

function signalChild(child: TestChildProcess, signal: NodeJS.Signals): void {
  if (useProcessGroup() && typeof child.pid === "number") {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch {
      // The group is already gone; fall back to signalling the child directly.
    }
  }
  child.kill(signal);
}

function hasExited(child: TestChildProcess): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}

function formatLogs(stdout: BoundedOutput, stderr: BoundedOutput): string {
  return `--- stdout ---\n${stdout.text()}\n--- stderr ---\n${stderr.text()}`;
}

async function waitForExit(child: TestChildProcess, timeoutMs: number): Promise<boolean> {
  return await Promise.race([
    new Promise<boolean>((resolve) => {
      if (hasExited(child)) {
        resolve(true);
        return;
      }
      child.once("exit", () => resolve(true));
    }),
    sleep(timeoutMs).then(() => false),
  ]);
}

async function probeReady(port: number): Promise<boolean> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), GATEWAY_READY_PROBE_TIMEOUT_MS);
  timer.unref?.();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/readyz`, { signal: abort.signal });
    if (!response.ok) {
      return false;
    }
    const body: unknown = await response.json();
    return isRecord(body) && body.ready === true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function waitForGatewayReady(
  child: TestChildProcess,
  stdout: BoundedOutput,
  stderr: BoundedOutput,
  port: number,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    // A dead child can never become ready, so surface its logs instead of polling to the deadline.
    if (hasExited(child)) {
      throw new Error(
        `gateway exited before readiness (code=${String(child.exitCode)} signal=${String(
          child.signalCode,
        )})\n${formatLogs(stdout, stderr)}`,
      );
    }
    if (await probeReady(port)) {
      return;
    }
    await sleep(GATEWAY_READY_POLL_MS);
  }
  throw new Error(
    `timeout waiting for gateway readiness on port ${port}\n${formatLogs(stdout, stderr)}`,
  );
}

/**
 * Builds the child env. Note this never touches `process.env` — `gateway.multi.e2e.test.ts`
 * runs two instances concurrently, so mutating global env would race between them.
 */
function createInstanceEnv(params: {
  homeDir: string;
  stateDir: string;
  configPath: string;
  extraEnv: Record<string, string | undefined>;
}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: params.homeDir,
    USERPROFILE: params.homeDir,
    REMOTECLAW_STATE_DIR: params.stateDir,
    REMOTECLAW_CONFIG_PATH: params.configPath,
    // Auth comes from the written config; clear inherited overrides so they cannot win.
    REMOTECLAW_GATEWAY_TOKEN: "",
    REMOTECLAW_GATEWAY_PASSWORD: "",
    REMOTECLAW_SKIP_CHANNELS: "1",
    REMOTECLAW_SKIP_PROVIDERS: "1",
    REMOTECLAW_SKIP_GMAIL_WATCHER: "1",
    REMOTECLAW_SKIP_CRON: "1",
    REMOTECLAW_SKIP_BROWSER_CONTROL_SERVER: "1",
    REMOTECLAW_SKIP_CANVAS_HOST: "1",
    REMOTECLAW_SKIP_ONBOARDING: "1",
    REMOTECLAW_TEST_MINIMAL_GATEWAY: "1",
    VITEST: "1",
  };
  if (process.platform === "win32") {
    const match = params.homeDir.match(/^([A-Za-z]:)(.*)$/u);
    if (match) {
      env.HOMEDRIVE = match[1];
      env.HOMEPATH = match[2] || "\\";
    }
  }
  for (const [key, value] of Object.entries(params.extraEnv)) {
    if (value === undefined) {
      delete env[key];
    } else {
      env[key] = value;
    }
  }
  return env;
}

/** Creates an isolated gateway instance; call `startGateway()` to boot it. */
export async function createRemoteClawTestInstance(
  options: RemoteClawTestInstanceOptions,
): Promise<RemoteClawTestInstance> {
  const cwd = options.cwd ?? process.cwd();
  const port = options.port ?? (await getFreePort());
  const gatewayToken = options.gatewayToken ?? `gateway-${options.name}-${randomUUID()}`;
  const hookToken = options.hookToken ?? `token-${options.name}-${randomUUID()}`;

  const root = await fs.mkdtemp(path.join(os.tmpdir(), `remoteclaw-e2e-${options.name}-`));
  const homeDir = path.join(root, "home");
  const stateDir = path.join(homeDir, ".remoteclaw");
  const workspaceDir = path.join(root, "workspace");
  const configPath = path.join(stateDir, "remoteclaw.json");
  await fs.mkdir(stateDir, { recursive: true });
  await fs.mkdir(workspaceDir, { recursive: true });
  await fs.writeFile(
    configPath,
    `${JSON.stringify(
      mergeConfig(
        {
          gateway: {
            port,
            auth: { mode: "token", token: gatewayToken },
            controlUi: { enabled: false },
          },
          hooks: { enabled: true, token: hookToken, path: "/hooks" },
          // Fork-specific: `startGatewayServer` resolves the default workspace from the first
          // `agents.list` entry and throws "No agents configured" without one
          // (`src/gateway/server.impl.ts:293-298`). Upstream's harness needs no equivalent.
          agents: { list: [{ id: "main", workspace: workspaceDir }] },
        },
        options.config,
      ),
      null,
      2,
    )}\n`,
    "utf8",
  );

  const stdout = createBoundedChildOutput();
  const stderr = createBoundedChildOutput();
  const env = createInstanceEnv({
    homeDir,
    stateDir,
    configPath,
    extraEnv: options.env ?? {},
  });

  let child: TestChildProcess | undefined;
  let cleaned = false;

  const instance: RemoteClawTestInstance = {
    name: options.name,
    port,
    url: `ws://127.0.0.1:${port}`,
    hookToken,
    gatewayToken,
    homeDir,
    stateDir,
    configPath,
    env,
    startGateway: async () => {
      if (child && !hasExited(child) && !child.killed) {
        return;
      }
      const entrypoint = await resolveGatewayEntrypoint(cwd);
      child = spawn(
        "node",
        [
          ...entrypoint,
          "gateway",
          "--port",
          String(port),
          "--bind",
          "loopback",
          "--allow-unconfigured",
          ...(options.gatewayArgs ?? []),
        ],
        {
          cwd,
          env,
          stdio: ["ignore", "pipe", "pipe"],
          detached: useProcessGroup(),
        },
      ) as TestChildProcess;

      child.stdout.on("data", (chunk) => stdout.append(chunk));
      child.stderr.on("data", (chunk) => stderr.append(chunk));

      try {
        await waitForGatewayReady(
          child,
          stdout,
          stderr,
          port,
          options.startTimeoutMs ?? GATEWAY_START_TIMEOUT_MS,
        );
      } catch (err) {
        await instance.stopGateway();
        throw err;
      }
    },
    stopGateway: async () => {
      if (!child) {
        return;
      }
      const stopTimeoutMs = options.stopTimeoutMs ?? GATEWAY_STOP_TIMEOUT_MS;
      if (!hasExited(child) && !child.killed) {
        signalChild(child, "SIGTERM");
      }
      let exited = await waitForExit(child, stopTimeoutMs);
      if (!exited && !hasExited(child)) {
        signalChild(child, "SIGKILL");
        exited = await waitForExit(child, stopTimeoutMs);
      }
      if (exited) {
        child = undefined;
      }
    },
    logs: () => formatLogs(stdout, stderr),
    cleanup: async () => {
      if (cleaned) {
        return;
      }
      cleaned = true;
      await instance.stopGateway();
      await fs.rm(root, { recursive: true, force: true });
    },
  };

  return instance;
}
