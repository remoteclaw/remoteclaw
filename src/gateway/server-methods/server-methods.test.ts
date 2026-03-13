import fs from "node:fs";
import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { emitAgentEvent } from "../../infra/agent-events.js";
import { formatZonedTimestamp } from "../../infra/format-time/format-datetime.js";
import { resetLogger, setLoggerOverride } from "../../logging.js";
import { waitForAgentJob } from "./agent-job.js";
import { injectTimestamp, timestampOptsFromConfig } from "./agent-timestamp.js";
import { normalizeRpcAttachmentsToChatAttachments } from "./attachment-normalize.js";
import { sanitizeChatSendMessageInput } from "./chat.js";
import { logsHandlers } from "./logs.js";

vi.mock("../../commands/status.js", () => ({
  getStatusSummary: vi.fn().mockResolvedValue({ ok: true }),
}));

describe("waitForAgentJob", () => {
  it("maps lifecycle end events with aborted=true to timeout", async () => {
    const runId = `run-timeout-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const waitPromise = waitForAgentJob({ runId, timeoutMs: 1_000 });

    emitAgentEvent({ runId, stream: "lifecycle", data: { phase: "start", startedAt: 100 } });
    emitAgentEvent({
      runId,
      stream: "lifecycle",
      data: { phase: "end", endedAt: 200, aborted: true },
    });

    const snapshot = await waitPromise;
    expect(snapshot).not.toBeNull();
    expect(snapshot?.status).toBe("timeout");
    expect(snapshot?.startedAt).toBe(100);
    expect(snapshot?.endedAt).toBe(200);
  });

  it("keeps non-aborted lifecycle end events as ok", async () => {
    const runId = `run-ok-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const waitPromise = waitForAgentJob({ runId, timeoutMs: 1_000 });

    emitAgentEvent({ runId, stream: "lifecycle", data: { phase: "start", startedAt: 300 } });
    emitAgentEvent({ runId, stream: "lifecycle", data: { phase: "end", endedAt: 400 } });

    const snapshot = await waitPromise;
    expect(snapshot).not.toBeNull();
    expect(snapshot?.status).toBe("ok");
    expect(snapshot?.startedAt).toBe(300);
    expect(snapshot?.endedAt).toBe(400);
  });

  it("can ignore cached snapshots and wait for fresh lifecycle events", async () => {
    const runId = `run-ignore-cache-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    emitAgentEvent({
      runId,
      stream: "lifecycle",
      data: { phase: "end", startedAt: 100, endedAt: 110 },
    });

    const cached = await waitForAgentJob({ runId, timeoutMs: 1_000 });
    expect(cached?.status).toBe("ok");
    expect(cached?.startedAt).toBe(100);
    expect(cached?.endedAt).toBe(110);

    const freshWait = waitForAgentJob({
      runId,
      timeoutMs: 1_000,
      ignoreCachedSnapshot: true,
    });
    queueMicrotask(() => {
      emitAgentEvent({
        runId,
        stream: "lifecycle",
        data: { phase: "start", startedAt: 200 },
      });
      emitAgentEvent({
        runId,
        stream: "lifecycle",
        data: { phase: "end", startedAt: 200, endedAt: 210 },
      });
    });

    const fresh = await freshWait;
    expect(fresh?.status).toBe("ok");
    expect(fresh?.startedAt).toBe(200);
    expect(fresh?.endedAt).toBe(210);
  });
});

describe("injectTimestamp", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-29T01:30:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("prepends a compact timestamp matching formatZonedTimestamp", () => {
    const result = injectTimestamp("Is it the weekend?", {
      timezone: "America/New_York",
    });

    expect(result).toMatch(/^\[Wed 2026-01-28 20:30 EST\] Is it the weekend\?$/);
  });

  it("uses channel envelope format with DOW prefix", () => {
    const now = new Date();
    const expected = formatZonedTimestamp(now, { timeZone: "America/New_York" });

    const result = injectTimestamp("hello", { timezone: "America/New_York" });

    expect(result).toBe(`[Wed ${expected}] hello`);
  });

  it("always uses 24-hour format", () => {
    const result = injectTimestamp("hello", { timezone: "America/New_York" });

    expect(result).toContain("20:30");
    expect(result).not.toContain("PM");
    expect(result).not.toContain("AM");
  });

  it("uses the configured timezone", () => {
    const result = injectTimestamp("hello", { timezone: "America/Chicago" });

    expect(result).toMatch(/^\[Wed 2026-01-28 19:30 CST\]/);
  });

  it("defaults to UTC when no timezone specified", () => {
    const result = injectTimestamp("hello", {});

    expect(result).toMatch(/^\[Thu 2026-01-29 01:30/);
  });

  it("returns empty/whitespace messages unchanged", () => {
    expect(injectTimestamp("", { timezone: "UTC" })).toBe("");
    expect(injectTimestamp("   ", { timezone: "UTC" })).toBe("   ");
  });

  it("does NOT double-stamp messages with channel envelope timestamps", () => {
    const enveloped = "[Discord user1 2026-01-28 20:30 EST] hello there";
    const result = injectTimestamp(enveloped, { timezone: "America/New_York" });

    expect(result).toBe(enveloped);
  });

  it("does NOT double-stamp messages already injected by us", () => {
    const alreadyStamped = "[Wed 2026-01-28 20:30 EST] hello there";
    const result = injectTimestamp(alreadyStamped, { timezone: "America/New_York" });

    expect(result).toBe(alreadyStamped);
  });

  it("does NOT double-stamp messages with cron-injected timestamps", () => {
    const cronMessage =
      "[cron:abc123 my-job] do the thing\nCurrent time: Wednesday, January 28th, 2026 — 8:30 PM (America/New_York)";
    const result = injectTimestamp(cronMessage, { timezone: "America/New_York" });

    expect(result).toBe(cronMessage);
  });

  it("handles midnight correctly", () => {
    vi.setSystemTime(new Date("2026-02-01T05:00:00.000Z"));

    const result = injectTimestamp("hello", { timezone: "America/New_York" });

    expect(result).toMatch(/^\[Sun 2026-02-01 00:00 EST\]/);
  });

  it("handles date boundaries (just before midnight)", () => {
    vi.setSystemTime(new Date("2026-02-01T04:59:00.000Z"));

    const result = injectTimestamp("hello", { timezone: "America/New_York" });

    expect(result).toMatch(/^\[Sat 2026-01-31 23:59 EST\]/);
  });

  it("handles DST correctly (same UTC hour, different local time)", () => {
    vi.setSystemTime(new Date("2026-01-15T05:00:00.000Z"));
    const winter = injectTimestamp("winter", { timezone: "America/New_York" });
    expect(winter).toMatch(/^\[Thu 2026-01-15 00:00 EST\]/);

    vi.setSystemTime(new Date("2026-07-15T04:00:00.000Z"));
    const summer = injectTimestamp("summer", { timezone: "America/New_York" });
    expect(summer).toMatch(/^\[Wed 2026-07-15 00:00 EDT\]/);
  });

  it("accepts a custom now date", () => {
    const customDate = new Date("2025-07-04T16:00:00.000Z");

    const result = injectTimestamp("fireworks?", {
      timezone: "America/New_York",
      now: customDate,
    });

    expect(result).toMatch(/^\[Fri 2025-07-04 12:00 EDT\]/);
  });
});

describe("timestampOptsFromConfig", () => {
  it.each([
    {
      name: "extracts timezone from config",
      // oxlint-disable-next-line typescript/no-explicit-any
      cfg: { agents: { defaults: { userTimezone: "America/Chicago" } } } as any,
      expected: "America/Chicago",
    },
    {
      name: "falls back gracefully with empty config",
      // oxlint-disable-next-line typescript/no-explicit-any
      cfg: {} as any,
      expected: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
  ])("$name", ({ cfg, expected }) => {
    expect(timestampOptsFromConfig(cfg).timezone).toBe(expected);
  });
});

describe("normalizeRpcAttachmentsToChatAttachments", () => {
  it.each([
    {
      name: "passes through string content",
      attachments: [{ type: "file", mimeType: "image/png", fileName: "a.png", content: "Zm9v" }],
      expected: [{ type: "file", mimeType: "image/png", fileName: "a.png", content: "Zm9v" }],
    },
    {
      name: "converts Uint8Array content to base64",
      attachments: [{ content: new TextEncoder().encode("foo") }],
      expected: [{ type: undefined, mimeType: undefined, fileName: undefined, content: "Zm9v" }],
    },
    {
      name: "converts ArrayBuffer content to base64",
      attachments: [{ content: new TextEncoder().encode("bar").buffer }],
      expected: [{ type: undefined, mimeType: undefined, fileName: undefined, content: "YmFy" }],
    },
    {
      name: "drops attachments without usable content",
      attachments: [{ content: undefined }, { mimeType: "image/png" }],
      expected: [],
    },
  ])("$name", ({ attachments, expected }) => {
    expect(normalizeRpcAttachmentsToChatAttachments(attachments)).toEqual(expected);
  });
});

describe("sanitizeChatSendMessageInput", () => {
  it.each([
    {
      name: "rejects null bytes",
      input: "before\u0000after",
      expected: { ok: false as const, error: "message must not contain null bytes" },
    },
    {
      name: "strips unsafe control characters while preserving tab/newline/carriage return",
      input: "a\u0001b\tc\nd\re\u0007f\u007f",
      expected: { ok: true as const, message: "ab\tc\nd\ref" },
    },
    {
      name: "normalizes unicode to NFC",
      input: "Cafe\u0301",
      expected: { ok: true as const, message: "Café" },
    },
  ])("$name", ({ input, expected }) => {
    expect(sanitizeChatSendMessageInput(input)).toEqual(expected);
  });
});

describe("gateway chat transcript writes (guardrail)", () => {
  it("routes transcript writes through helper with JSONL append", () => {
    const chatTs = fileURLToPath(new URL("./chat.ts", import.meta.url));
    const chatSrc = fs.readFileSync(chatTs, "utf-8");
    const helperTs = fileURLToPath(new URL("./chat-transcript-inject.ts", import.meta.url));
    const helperSrc = fs.readFileSync(helperTs, "utf-8");

    expect(chatSrc.includes("fs.appendFileSync(transcriptPath")).toBe(false);
    expect(chatSrc).toContain("appendInjectedAssistantMessageToTranscript(");

    expect(helperSrc.includes("fs.appendFileSync(params.transcriptPath")).toBe(false);
    expect(helperSrc).toContain("SessionManager.open(params.transcriptPath)");
    expect(helperSrc).toContain("appendMessage(messageBody)");
  });
});

describe("gateway healthHandlers.status scope handling", () => {
  let statusModule: typeof import("../../commands/status.js");
  let healthHandlers: typeof import("./health.js").healthHandlers;

  beforeAll(async () => {
    statusModule = await import("../../commands/status.js");
    ({ healthHandlers } = await import("./health.js"));
  });

  beforeEach(() => {
    vi.mocked(statusModule.getStatusSummary).mockClear();
  });

  async function runHealthStatus(scopes: string[]) {
    const respond = vi.fn();

    await healthHandlers.status({
      req: {} as never,
      params: {} as never,
      respond: respond as never,
      context: {} as never,
      client: { connect: { role: "operator", scopes } } as never,
      isWebchatConnect: () => false,
    });

    return respond;
  }

  it.each([
    { scopes: ["operator.read"], includeSensitive: false },
    { scopes: ["operator.admin"], includeSensitive: true },
  ])(
    "requests includeSensitive=$includeSensitive for scopes $scopes",
    async ({ scopes, includeSensitive }) => {
      const respond = await runHealthStatus(scopes);

      expect(vi.mocked(statusModule.getStatusSummary)).toHaveBeenCalledWith({ includeSensitive });
      expect(respond).toHaveBeenCalledWith(true, { ok: true }, undefined);
    },
  );
});

describe("logs.tail", () => {
  const logsNoop = () => false;

  afterEach(() => {
    resetLogger();
    setLoggerOverride(null);
  });

  it("falls back to latest rolling log file when today is missing", async () => {
    const tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "remoteclaw-logs-"));
    const older = path.join(tempDir, "remoteclaw-2026-01-20.log");
    const newer = path.join(tempDir, "remoteclaw-2026-01-21.log");

    await fsPromises.writeFile(older, '{"msg":"old"}\n');
    await fsPromises.writeFile(newer, '{"msg":"new"}\n');
    await fsPromises.utimes(older, new Date(0), new Date(0));
    await fsPromises.utimes(newer, new Date(), new Date());

    setLoggerOverride({ file: path.join(tempDir, "remoteclaw-2026-01-22.log") });

    const respond = vi.fn();
    await logsHandlers["logs.tail"]({
      params: {},
      respond,
      context: {} as unknown as Parameters<(typeof logsHandlers)["logs.tail"]>[0]["context"],
      client: null,
      req: { id: "req-1", type: "req", method: "logs.tail" },
      isWebchatConnect: logsNoop,
    });

    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        file: newer,
        lines: ['{"msg":"new"}'],
      }),
      undefined,
    );

    await fsPromises.rm(tempDir, { recursive: true, force: true });
  });
});
