import { vi } from "vitest";
import { installChromeUserDataDirHooks } from "./chrome-user-data-dir.test-harness.js";

const chromeUserDataDir = { dir: "/tmp/remoteclaw" };
installChromeUserDataDirHooks(chromeUserDataDir);

vi.mock("./chrome.js", () => ({
  isChromeCdpReady: vi.fn(async () => true),
  isChromeReachable: vi.fn(async () => true),
  launchRemoteClawChrome: vi.fn(async () => {
    throw new Error("unexpected launch");
  }),
  resolveRemoteClawUserDataDir: vi.fn(() => chromeUserDataDir.dir),
  stopRemoteClawChrome: vi.fn(async () => {}),
}));
