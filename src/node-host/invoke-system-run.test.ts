import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  handleSystemRunInvoke,
  formatSystemRunAllowlistMissMessage,
  type HandleSystemRunInvokeOptions,
} from "./invoke-system-run.js";

describe("formatSystemRunAllowlistMissMessage", () => {
  it("returns legacy allowlist miss message by default", () => {
    expect(formatSystemRunAllowlistMissMessage()).toBe("SYSTEM_RUN_DENIED: allowlist miss");
  });
});

describe("handleSystemRunInvoke mac app exec host routing", () => {
  function createMacExecHostSuccess(stdout = "app-ok") {
    return {
      ok: true,
      payload: {
        success: true,
        stdout,
        stderr: "",
        timedOut: false,
        exitCode: 0,
        error: null,
      },
    };
  }

  function resolveStatTargetPath(target: string | Buffer | URL | number): string {
    if (typeof target === "string") {
      return path.resolve(target);
    }
    if (Buffer.isBuffer(target)) {
      return path.resolve(target.toString());
    }
    if (target instanceof URL) {
      return path.resolve(target.pathname);
    }
    return path.resolve(String(target));
  }

  async function withMockedCwdIdentityDrift<T>(params: {
    canonicalCwd: string;
    driftDir: string;
    stableHitsBeforeDrift?: number;
    run: () => Promise<T>;
  }): Promise<T> {
    const stableHitsBeforeDrift = params.stableHitsBeforeDrift ?? 2;
    const realStatSync = fs.statSync.bind(fs);
    const baselineStat = realStatSync(params.canonicalCwd);
    const driftStat = realStatSync(params.driftDir);
    let canonicalHits = 0;
    const statSpy = vi.spyOn(fs, "statSync").mockImplementation((...args) => {
      const resolvedTarget = resolveStatTargetPath(args[0]);
      if (resolvedTarget === params.canonicalCwd) {
        canonicalHits += 1;
        if (canonicalHits > stableHitsBeforeDrift) {
          return driftStat;
        }
        return baselineStat;
      }
      return realStatSync(...args);
    });
    try {
      return await params.run();
    } finally {
      statSpy.mockRestore();
    }
  }

  async function runSystemInvoke(params: {
    preferMacAppExecHost: boolean;
    runViaResponse?: Record<string, unknown> | null;
    command?: string[];
    cwd?: string;
    security?: "full" | "allowlist";
    ask?: "off" | "on-miss" | "always";
    approved?: boolean;
    runCommand?: ReturnType<typeof vi.fn>;
    sendInvokeResult?: ReturnType<typeof vi.fn>;
    sendNodeEvent?: ReturnType<typeof vi.fn>;
  }) {
    const runCommand =
      params.runCommand ??
      vi.fn(async () => ({
        success: true,
        stdout: "local-ok",
        stderr: "",
        timedOut: false,
        truncated: false,
        exitCode: 0,
        error: null,
      }));
    const runViaMacAppExecHost = vi.fn(async () => params.runViaResponse ?? null);
    const sendInvokeResult = params.sendInvokeResult ?? vi.fn(async () => {});
    const sendNodeEvent = params.sendNodeEvent ?? vi.fn(async () => {});
    const sendExecFinishedEvent = vi.fn(async () => {});

    await handleSystemRunInvoke({
      client: {} as never,
      params: {
        command: params.command ?? ["echo", "ok"],
        cwd: params.cwd,
        approved: params.approved ?? false,
        sessionKey: "agent:main:main",
      },
      execHostEnforced: false,
      execHostFallbackAllowed: true,
      resolveExecSecurity: () => params.security ?? "full",
      resolveExecAsk: () => params.ask ?? "off",
      isCmdExeInvocation: () => false,
      sanitizeEnv: () => undefined,
      runCommand: runCommand as HandleSystemRunInvokeOptions["runCommand"],
      runViaMacAppExecHost:
        runViaMacAppExecHost as HandleSystemRunInvokeOptions["runViaMacAppExecHost"],
      sendNodeEvent: sendNodeEvent as HandleSystemRunInvokeOptions["sendNodeEvent"],
      buildExecEventPayload: (payload) => payload,
      sendInvokeResult: sendInvokeResult as HandleSystemRunInvokeOptions["sendInvokeResult"],
      sendExecFinishedEvent,
      preferMacAppExecHost: params.preferMacAppExecHost,
    });

    return {
      runCommand,
      runViaMacAppExecHost,
      sendInvokeResult,
      sendNodeEvent,
      sendExecFinishedEvent,
    };
  }

  it("uses local execution by default when mac app exec host preference is disabled", async () => {
    const { runCommand, runViaMacAppExecHost, sendInvokeResult } = await runSystemInvoke({
      preferMacAppExecHost: false,
    });

    expect(runViaMacAppExecHost).not.toHaveBeenCalled();
    expect(runCommand).toHaveBeenCalledTimes(1);
    expect(sendInvokeResult).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: true,
        payloadJSON: expect.stringContaining("local-ok"),
      }),
    );
  });

  it("uses mac app exec host when explicitly preferred", async () => {
    const { runCommand, runViaMacAppExecHost, sendInvokeResult } = await runSystemInvoke({
      preferMacAppExecHost: true,
      runViaResponse: createMacExecHostSuccess(),
    });

    expect(runViaMacAppExecHost).toHaveBeenCalledWith({
      approvals: expect.objectContaining({
        agent: expect.objectContaining({
          security: "full",
          ask: "off",
        }),
      }),
      request: expect.objectContaining({
        command: ["echo", "ok"],
      }),
    });
    expect(runCommand).not.toHaveBeenCalled();
    expect(sendInvokeResult).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: true,
        payloadJSON: expect.stringContaining("app-ok"),
      }),
    );
  });

  it("forwards canonical cmdText to mac app exec host for positional-argv shell wrappers", async () => {
    const { runViaMacAppExecHost } = await runSystemInvoke({
      preferMacAppExecHost: true,
      command: ["/bin/sh", "-lc", '$0 "$1"', "/usr/bin/touch", "/tmp/marker"],
      runViaResponse: createMacExecHostSuccess(),
    });

    expect(runViaMacAppExecHost).toHaveBeenCalledWith({
      approvals: expect.anything(),
      request: expect.objectContaining({
        command: ["/bin/sh", "-lc", '$0 "$1"', "/usr/bin/touch", "/tmp/marker"],
        rawCommand: '/bin/sh -lc $0 "$1" /usr/bin/touch /tmp/marker',
      }),
    });
  });

  // Tests for env wrapper transparency, denial, and PATH-token pinning in allowlist mode
  // are not applicable: the fork gutted exec-approvals infrastructure (analyzeArgvCommand,
  // evaluateExecAllowlist, evaluateSystemRunPolicy are stubs).  Upstream tests exercised
  // the real allowlist pipeline which is absent in the fork.

  it.runIf(process.platform !== "win32")(
    "denies approval-based execution when cwd is a symlink",
    async () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "remoteclaw-approval-cwd-link-"));
      const safeDir = path.join(tmp, "safe");
      const linkDir = path.join(tmp, "cwd-link");
      const script = path.join(safeDir, "run.sh");
      fs.mkdirSync(safeDir, { recursive: true });
      fs.writeFileSync(script, "#!/bin/sh\necho SAFE\n");
      fs.chmodSync(script, 0o755);
      fs.symlinkSync(safeDir, linkDir, "dir");
      try {
        const { runCommand, sendInvokeResult } = await runSystemInvoke({
          preferMacAppExecHost: false,
          command: ["./run.sh"],
          cwd: linkDir,
          approved: true,
          security: "full",
          ask: "off",
        });
        expect(runCommand).not.toHaveBeenCalled();
        expect(sendInvokeResult).toHaveBeenCalledWith(
          expect.objectContaining({
            ok: false,
            error: expect.objectContaining({
              message: expect.stringContaining("canonical cwd"),
            }),
          }),
        );
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    },
  );

  it.runIf(process.platform !== "win32")(
    "denies approval-based execution when cwd contains a symlink parent component",
    async () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "remoteclaw-approval-cwd-parent-link-"));
      const safeRoot = path.join(tmp, "safe-root");
      const safeSub = path.join(safeRoot, "sub");
      const linkRoot = path.join(tmp, "approved-link");
      fs.mkdirSync(safeSub, { recursive: true });
      fs.symlinkSync(safeRoot, linkRoot, "dir");
      try {
        const { runCommand, sendInvokeResult } = await runSystemInvoke({
          preferMacAppExecHost: false,
          command: ["./run.sh"],
          cwd: path.join(linkRoot, "sub"),
          approved: true,
          security: "full",
          ask: "off",
        });
        expect(runCommand).not.toHaveBeenCalled();
        expect(sendInvokeResult).toHaveBeenCalledWith(
          expect.objectContaining({
            ok: false,
            error: expect.objectContaining({
              message: expect.stringContaining("no symlink path components"),
            }),
          }),
        );
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    },
  );

  it("uses canonical executable path for approval-based relative command execution", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "remoteclaw-approval-cwd-real-"));
    const script = path.join(tmp, "run.sh");
    fs.writeFileSync(script, "#!/bin/sh\necho SAFE\n");
    fs.chmodSync(script, 0o755);
    try {
      const { runCommand, sendInvokeResult } = await runSystemInvoke({
        preferMacAppExecHost: false,
        command: ["./run.sh", "--flag"],
        cwd: tmp,
        approved: true,
        security: "full",
        ask: "off",
      });
      expect(runCommand).toHaveBeenCalledWith(
        [fs.realpathSync(script), "--flag"],
        fs.realpathSync(tmp),
        undefined,
        undefined,
      );
      expect(sendInvokeResult).toHaveBeenCalledWith(
        expect.objectContaining({
          ok: true,
        }),
      );
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("denies approval-based execution when cwd identity drifts before execution", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "remoteclaw-approval-cwd-drift-"));
    const fallback = fs.mkdtempSync(path.join(os.tmpdir(), "remoteclaw-approval-cwd-drift-alt-"));
    const script = path.join(tmp, "run.sh");
    fs.writeFileSync(script, "#!/bin/sh\necho SAFE\n");
    fs.chmodSync(script, 0o755);
    const canonicalCwd = fs.realpathSync(tmp);
    try {
      await withMockedCwdIdentityDrift({
        canonicalCwd,
        driftDir: fallback,
        run: async () => {
          const { runCommand, sendInvokeResult } = await runSystemInvoke({
            preferMacAppExecHost: false,
            command: ["./run.sh"],
            cwd: tmp,
            approved: true,
            security: "full",
            ask: "off",
          });
          expect(runCommand).not.toHaveBeenCalled();
          expect(sendInvokeResult).toHaveBeenCalledWith(
            expect.objectContaining({
              ok: false,
              error: expect.objectContaining({
                message: expect.stringContaining("approval cwd changed before execution"),
              }),
            }),
          );
        },
      });
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      fs.rmSync(fallback, { recursive: true, force: true });
    }
  });

  // Tests for env -S shell payloads, semicolon-chained shell payloads, wrapper spoofs,
  // skill-bin denial, and nested env depth in allowlist mode are not applicable: the fork
  // gutted exec-approvals infrastructure (evaluateSystemRunPolicy, analyzeArgvCommand are
  // stubs).  Upstream tests exercised the real allowlist/policy pipeline.
});
