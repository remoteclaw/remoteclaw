import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import { WebSocket } from "ws";
import { CONFIG_PATH } from "../config/config.js";

vi.mock("../infra/update-runner.js", () => ({
  runGatewayUpdate: vi.fn(async () => ({
    status: "ok",
    mode: "git",
    root: "/repo",
    steps: [],
    durationMs: 12,
  })),
}));

import { runGatewayUpdate } from "../infra/update-runner.js";
import { installGatewayTestHooks, onceMessage } from "./test-helpers.js";
import { installConnectedControlUiServerSuite } from "./test-with-server.js";

installGatewayTestHooks({ scope: "suite" });

let ws: WebSocket;

installConnectedControlUiServerSuite((started) => {
  ws = started.ws;
});

describe("gateway update.run", () => {
  test("uses configured update channel", async () => {
    const sigusr1 = vi.fn();
    process.on("SIGUSR1", sigusr1);

    try {
      await fs.mkdir(path.dirname(CONFIG_PATH), { recursive: true });
      await fs.writeFile(CONFIG_PATH, JSON.stringify({ update: { channel: "beta" } }, null, 2));
      const updateMock = vi.mocked(runGatewayUpdate);
      updateMock.mockClear();

      const id = "req-update-channel";
      ws.send(
        JSON.stringify({
          type: "req",
          id,
          method: "update.run",
          params: {
            restartDelayMs: 0,
          },
        }),
      );
      const res = await onceMessage(ws, (o) => o.type === "res" && o.id === id);
      expect(res.ok).toBe(true);
      expect(updateMock).toHaveBeenCalledOnce();
    } finally {
      process.off("SIGUSR1", sigusr1);
    }
  });
});
