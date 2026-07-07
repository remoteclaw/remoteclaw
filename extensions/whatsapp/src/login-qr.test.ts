import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeEnv } from "../../../src/runtime.js";

vi.mock("./qr-image.js", () => ({
  renderQrPngBase64: vi.fn(async (input: string) => `encoded:${input}`),
}));

vi.mock("./session.js", async () => {
  const actual = await vi.importActual<typeof import("./session.js")>("./session.js");
  return {
    ...actual,
    createWaSocket: vi.fn(),
    waitForWaConnection: vi.fn(),
    webAuthExists: vi.fn(async () => false),
    readWebSelfId: vi.fn(() => ({ e164: null, jid: null })),
    logoutWeb: vi.fn(async () => true),
  };
});

vi.mock("./accounts.js", async () => {
  const actual = await vi.importActual<typeof import("./accounts.js")>("./accounts.js");
  return {
    ...actual,
    resolveWhatsAppAccount: vi.fn((params: { accountId?: string }) => ({
      accountId: params.accountId ?? "default",
      enabled: true,
      sendReadReceipts: true,
      authDir: `/tmp/wa-login-qr-test/${params.accountId ?? "default"}`,
      isLegacyAuthDir: false,
    })),
  };
});

vi.mock("../../../src/config/config.js", async () => {
  const actual = await vi.importActual<typeof import("../../../src/config/config.js")>(
    "../../../src/config/config.js",
  );
  return {
    ...actual,
    loadConfig: vi.fn(() => ({})),
  };
});

import { startWebLoginWithQr, waitForWebLogin } from "./login-qr.js";
import { createWaSocket, waitForWaConnection } from "./session.js";

const createWaSocketMock = vi.mocked(createWaSocket);
const waitForWaConnectionMock = vi.mocked(waitForWaConnection);

// Silence the runtime logger so tests do not spam stdout.
const runtime: RuntimeEnv = { log: vi.fn(), error: vi.fn(), exit: vi.fn() };

const RENDERED_QR = "data:image/png;base64,encoded:qr-data";

async function flushTasks() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("waitForWebLogin QR sync guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createWaSocketMock
      .mockReset()
      .mockImplementation(
        async (
          _printQr: boolean,
          _verbose: boolean,
          opts?: { authDir?: string; onQr?: (qr: string) => void },
        ) => {
          const sock = { ws: { close: vi.fn() } };
          if (opts?.onQr) {
            setImmediate(() => opts.onQr?.("qr-data"));
          }
          return sock as never;
        },
      );
    waitForWaConnectionMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("reports the connection when the caller's current QR matches the active QR", async () => {
    const accountId = "qr-matches";
    waitForWaConnectionMock.mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve(undefined), 10)),
    );

    const start = await startWebLoginWithQr({ timeoutMs: 5000, accountId, runtime });
    expect(start.qrDataUrl).toBe(RENDERED_QR);

    await expect(
      waitForWebLogin({
        timeoutMs: 5000,
        accountId,
        currentQrDataUrl: start.qrDataUrl,
        runtime,
      }),
    ).resolves.toEqual({
      connected: true,
      message: "✅ Linked! WhatsApp is ready.",
    });
  });

  it("does not short-circuit when the waiter has no current QR image", async () => {
    const accountId = "wait-without-current-qr";
    waitForWaConnectionMock.mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve(undefined), 10)),
    );

    const start = await startWebLoginWithQr({ timeoutMs: 5000, accountId, runtime });
    expect(start.qrDataUrl).toBe(RENDERED_QR);

    await expect(waitForWebLogin({ timeoutMs: 5000, accountId, runtime })).resolves.toEqual({
      connected: true,
      message: "✅ Linked! WhatsApp is ready.",
    });
  });

  it("returns a QR-refresh result when the caller's current QR is stale", async () => {
    const accountId = "stale-current-qr";
    // Keep the connection pending so the login stays in the QR-wait state.
    waitForWaConnectionMock.mockImplementationOnce(() => new Promise<void>(() => {}));

    const start = await startWebLoginWithQr({ timeoutMs: 5000, accountId, runtime });
    expect(start.qrDataUrl).toBe(RENDERED_QR);

    await expect(
      waitForWebLogin({
        timeoutMs: 5000,
        accountId,
        currentQrDataUrl: "data:image/png;base64,stale-qr",
        runtime,
      }),
    ).resolves.toEqual({
      connected: false,
      message: "QR refreshed. Scan the latest code in WhatsApp → Linked Devices.",
      qrDataUrl: RENDERED_QR,
    });
  });

  it("returns a terminal login result before a stale QR refresh", async () => {
    const accountId = "connected-before-refresh";
    waitForWaConnectionMock.mockResolvedValueOnce(undefined);

    const start = await startWebLoginWithQr({ timeoutMs: 5000, accountId, runtime });
    expect(start.qrDataUrl).toBe(RENDERED_QR);

    // Let the login waiter resolve so the login is connected before we wait.
    await flushTasks();

    await expect(
      waitForWebLogin({
        timeoutMs: 5000,
        accountId,
        currentQrDataUrl: "data:image/png;base64,stale-qr",
        runtime,
      }),
    ).resolves.toEqual({
      connected: true,
      message: "✅ Linked! WhatsApp is ready.",
    });
  });
});
