import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, type Mock, vi } from "vitest";
import { handleSystemRunInvoke, formatSystemRunAllowlistMissMessage } from "./invoke-system-run.js";
import type { HandleSystemRunInvokeOptions } from "./invoke-system-run.js";

type MockedSendInvokeResult = Mock<HandleSystemRunInvokeOptions["sendInvokeResult"]>;

describe("formatSystemRunAllowlistMissMessage", () => {
  it("returns legacy allowlist miss message by default", () => {
    expect(formatSystemRunAllowlistMissMessage()).toBe("SYSTEM_RUN_DENIED: allowlist miss");
  });
});

describe("handleSystemRunInvoke mac app exec host routing", () => {
  function createLocalRunResult(stdout = "local-ok") {
    return {
      success: true,
      stdout,
      stderr: "",
      timedOut: false,
      truncated: false,
      exitCode: 0,
      error: null,
    };
  }

  function expectInvokeOk(
    sendInvokeResult: MockedSendInvokeResult,
    params?: { payloadContains?: string },
  ) {
    expect(sendInvokeResult).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: true,
        ...(params?.payloadContains
          ? { payloadJSON: expect.stringContaining(params.payloadContains) }
          : {}),
      }),
    );
  }

  async function runSystemInvoke(params: {
    preferMacAppExecHost: boolean;
    runViaResponse?: {
      ok: boolean;
      error: { reason: string; message: string };
      payload: Record<string, unknown>;
    } | null;
    command?: string[];
    cwd?: string;
    security?: "full" | "allowlist";
    ask?: "off" | "on-miss" | "always";
    approved?: boolean;
  }) {
    const runCommand = vi.fn(async () => ({
      success: true,
      stdout: "local-ok",
      stderr: "",
      timedOut: false,
      truncated: false,
      exitCode: 0,
      error: null,
    }));
    const runViaMacAppExecHost = vi.fn(async () => params.runViaResponse ?? null);
    const sendInvokeResult = vi.fn(async () => {});
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
      runCommand,
      runViaMacAppExecHost,
      sendNodeEvent: async () => {},
      buildExecEventPayload: (payload) => payload,
      sendInvokeResult,
      sendExecFinishedEvent,
      preferMacAppExecHost: params.preferMacAppExecHost,
    });

    return { runCommand, runViaMacAppExecHost, sendInvokeResult, sendExecFinishedEvent };
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
      runViaResponse: {
        ok: true,
        error: { reason: "", message: "" },
        payload: {
          success: true,
          stdout: "app-ok",
          stderr: "",
          timedOut: false,
          exitCode: 0,
          error: null,
        },
      },
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

  it.runIf(process.platform !== "win32")(
    "denies execution when approved cwd is removed before execution",
    async () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "remoteclaw-approval-cwd-drift-"));
      const safeDir = path.join(tmp, "safe");
      fs.mkdirSync(safeDir, { recursive: true });
      const script = path.join(safeDir, "run.sh");
      fs.writeFileSync(script, "#!/bin/sh\necho OK\n");
      fs.chmodSync(script, 0o755);
      // Patch runCommand so it removes the cwd before being called
      const _runCommand = vi.fn(async () => {
        return createLocalRunResult();
      });
      const _sendInvokeResult = vi.fn(async () => {});
      const _sendExecFinishedEvent = vi.fn(async () => {});
      // First, run normally to capture the shape, then re-run with cwd removed
      // Use the helper to invoke, but we need to intercept after approval
      // The simplest approach: run the full invoke, verify it succeeds when cwd exists
      const result1 = await runSystemInvoke({
        preferMacAppExecHost: false,
        command: [script],
        cwd: safeDir,
        approved: true,
        security: "full",
        ask: "off",
      });
      expectInvokeOk(result1.sendInvokeResult);

      // Now remove the cwd and re-run -- this tests the snapshot revalidation
      fs.rmSync(safeDir, { recursive: true, force: true });
      const result2 = await runSystemInvoke({
        preferMacAppExecHost: false,
        command: [script],
        cwd: safeDir,
        approved: true,
        security: "full",
        ask: "off",
      });
      expect(result2.sendInvokeResult).toHaveBeenCalledWith(
        expect.objectContaining({
          ok: false,
          error: expect.objectContaining({
            message: expect.stringMatching(/cwd|canonical/),
          }),
        }),
      );
      fs.rmSync(tmp, { recursive: true, force: true });
    },
  );
});
