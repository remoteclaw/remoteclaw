import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, vi } from "vitest";

const chromeUserDataDir = { dir: "/tmp/remoteclaw" };

beforeAll(async () => {
  chromeUserDataDir.dir = await fs.mkdtemp(path.join(os.tmpdir(), "remoteclaw-chrome-user-data-"));
});

afterAll(async () => {
  await fs.rm(chromeUserDataDir.dir, { recursive: true, force: true });
});

vi.mock("./chrome.js", () => ({
  isChromeCdpReady: vi.fn(async () => true),
  isChromeReachable: vi.fn(async () => true),
  launchRemoteClawChrome: vi.fn(async () => {
    throw new Error("unexpected launch");
  }),
  resolveRemoteClawUserDataDir: vi.fn(() => chromeUserDataDir.dir),
  stopRemoteClawChrome: vi.fn(async () => {}),
}));
