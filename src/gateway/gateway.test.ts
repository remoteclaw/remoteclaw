import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { captureEnv } from "../test-utils/env.js";
import { startGatewayServer } from "./server.js";
import {
  connectDeviceAuthReq,
  connectGatewayClient,
  getFreeGatewayPort,
} from "./test-helpers.e2e.js";

let writeConfigFile: typeof import("../config/config.js").writeConfigFile;
let resolveConfigPath: typeof import("../config/config.js").resolveConfigPath;
const GATEWAY_E2E_TIMEOUT_MS = 30_000;

describe("gateway e2e", () => {
  beforeAll(async () => {
    ({ writeConfigFile, resolveConfigPath } = await import("../config/config.js"));
  });

  it(
    "runs wizard over ws and writes auth token config",
    { timeout: GATEWAY_E2E_TIMEOUT_MS },
    async () => {
      const envSnapshot = captureEnv([
        "HOME",
        "REMOTECLAW_STATE_DIR",
        "REMOTECLAW_CONFIG_PATH",
        "REMOTECLAW_GATEWAY_TOKEN",
        "REMOTECLAW_SKIP_CHANNELS",
        "REMOTECLAW_SKIP_GMAIL_WATCHER",
        "REMOTECLAW_SKIP_CRON",
        "REMOTECLAW_SKIP_CANVAS_HOST",
        "REMOTECLAW_SKIP_BROWSER_CONTROL_SERVER",
      ]);

      process.env.REMOTECLAW_SKIP_CHANNELS = "1";
      process.env.REMOTECLAW_SKIP_GMAIL_WATCHER = "1";
      process.env.REMOTECLAW_SKIP_CRON = "1";
      process.env.REMOTECLAW_SKIP_CANVAS_HOST = "1";
      process.env.REMOTECLAW_SKIP_BROWSER_CONTROL_SERVER = "1";
      delete process.env.REMOTECLAW_GATEWAY_TOKEN;

      const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-wizard-home-"));
      process.env.HOME = tempHome;
      delete process.env.REMOTECLAW_STATE_DIR;
      delete process.env.REMOTECLAW_CONFIG_PATH;

      const wizardToken = `wiz-${randomUUID()}`;
      const port = await getFreeGatewayPort();
      const server = await startGatewayServer(port, {
        bind: "loopback",
        auth: { mode: "token", token: wizardToken },
        controlUiEnabled: false,
        wizardRunner: async (_opts, _runtime, prompter) => {
          await prompter.intro("Wizard E2E");
          await prompter.note("write token");
          const token = await prompter.text({ message: "token" });
          await writeConfigFile({
            gateway: { auth: { mode: "token", token: String(token) } },
          });
          await prompter.outro("ok");
        },
      });

      const client = await connectGatewayClient({
        url: `ws://127.0.0.1:${port}`,
        token: wizardToken,
        clientDisplayName: "vitest-wizard",
      });

      try {
        const start = await client.request<{
          sessionId?: string;
          done: boolean;
          status: "running" | "done" | "cancelled" | "error";
          step?: {
            id: string;
            type: "note" | "select" | "text" | "confirm" | "multiselect" | "progress";
          };
          error?: string;
        }>("wizard.start", { mode: "local" });
        const sessionId = start.sessionId;
        expect(typeof sessionId).toBe("string");

        let next = start;
        let didSendToken = false;
        while (!next.done) {
          const step = next.step;
          if (!step) {
            throw new Error("wizard missing step");
          }
          const value = step.type === "text" ? wizardToken : null;
          if (step.type === "text") {
            didSendToken = true;
          }
          next = await client.request("wizard.next", {
            sessionId,
            answer: { stepId: step.id, value },
          });
        }

        expect(didSendToken).toBe(true);
        expect(next.status).toBe("done");

        const parsed = JSON.parse(await fs.readFile(resolveConfigPath(), "utf8"));
        const token = (parsed as Record<string, unknown>)?.gateway as
          | Record<string, unknown>
          | undefined;
        expect((token?.auth as { token?: string } | undefined)?.token).toBe(wizardToken);
      } finally {
        client.stop();
        await server.close({ reason: "wizard e2e complete" });
      }

      const port2 = await getFreeGatewayPort();
      const server2 = await startGatewayServer(port2, {
        bind: "loopback",
        controlUiEnabled: false,
      });
      try {
        const resNoToken = await connectDeviceAuthReq({
          url: `ws://127.0.0.1:${port2}`,
        });
        expect(resNoToken.ok).toBe(false);
        expect(resNoToken.error?.message ?? "").toContain("unauthorized");

        const resToken = await connectDeviceAuthReq({
          url: `ws://127.0.0.1:${port2}`,
          token: wizardToken,
        });
        expect(resToken.ok).toBe(true);
      } finally {
        await server2.close({ reason: "wizard auth verify" });
        await fs.rm(tempHome, { recursive: true, force: true });
        envSnapshot.restore();
      }
    },
  );
});
