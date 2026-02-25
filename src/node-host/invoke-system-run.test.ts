import { describe, expect, it, vi } from "vitest";
import { handleSystemRunInvoke, formatSystemRunAllowlistMissMessage } from "./invoke-system-run.js";

describe("formatSystemRunAllowlistMissMessage", () => {
  it("returns legacy allowlist miss message by default", () => {
    expect(formatSystemRunAllowlistMissMessage()).toBe("SYSTEM_RUN_DENIED: allowlist miss");
  });
});

describe("handleSystemRunInvoke mac app exec host routing", () => {
  async function runSystemInvoke(params: {
    preferMacAppExecHost: boolean;
    runViaResponse?: {
      ok: boolean;
      error: { reason: string; message: string };
      payload: Record<string, unknown>;
    } | null;
    command?: string[];
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

  it("denies semicolon-chained shell payloads in allowlist mode without explicit approval", async () => {
    const payloads = ["remoteclaw status; id", "remoteclaw status; cat /etc/passwd"];
    for (const payload of payloads) {
      const command =
        process.platform === "win32"
          ? ["cmd.exe", "/d", "/s", "/c", payload]
          : ["/bin/sh", "-lc", payload];
      const { runCommand, sendInvokeResult } = await runSystemInvoke({
        preferMacAppExecHost: false,
        security: "allowlist",
        ask: "on-miss",
        command,
      });
      expect(runCommand, payload).not.toHaveBeenCalled();
      expect(sendInvokeResult, payload).toHaveBeenCalledWith(
        expect.objectContaining({
          ok: false,
          error: expect.objectContaining({
            message: "SYSTEM_RUN_DENIED: approval required",
          }),
        }),
      );
    }
  });
});
