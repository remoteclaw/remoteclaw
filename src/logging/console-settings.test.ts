import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { captureConsoleSnapshot, type ConsoleSnapshot } from "./test-helpers/console-snapshot.js";

vi.mock("./config.js", () => ({
  readLoggingConfig: () => undefined,
}));

vi.mock("./logger.js", () => ({
  getLogger: () => ({
    trace: () => {},
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    fatal: () => {},
  }),
}));

let loadConfigCalls = 0;
let originalIsTty: boolean | undefined;
let originalRemoteClawTestConsole: string | undefined;
let snapshot: ConsoleSnapshot;
let logging: typeof import("../logging.js");
let state: typeof import("./state.js");

beforeAll(async () => {
  logging = await import("../logging.js");
  state = await import("./state.js");
});

beforeEach(() => {
  loadConfigCalls = 0;
  snapshot = captureConsoleSnapshot();
  originalIsTty = process.stdout.isTTY;
  originalRemoteClawTestConsole = process.env.REMOTECLAW_TEST_CONSOLE;
  process.env.REMOTECLAW_TEST_CONSOLE = "1";
  Object.defineProperty(process.stdout, "isTTY", { value: false, configurable: true });
});

afterEach(() => {
  restoreConsoleSnapshot(snapshot);
  if (originalRemoteClawTestConsole === undefined) {
    delete process.env.REMOTECLAW_TEST_CONSOLE;
  } else {
    process.env.REMOTECLAW_TEST_CONSOLE = originalRemoteClawTestConsole;
  }
  Object.defineProperty(process.stdout, "isTTY", { value: originalIsTty, configurable: true });
  logging.setConsoleConfigLoaderForTests();
  vi.restoreAllMocks();
});

function loadLogging() {
  state.loggingState.cachedConsoleSettings = null;
  logging.setConsoleConfigLoaderForTests(() => {
    loadConfigCalls += 1;
    if (loadConfigCalls > 5) {
      return {};
    }
    console.error("config load failed");
    return {};
  });
  return { logging, state };
}

describe("getConsoleSettings", () => {
  it("does not recurse when loadConfig logs during resolution", () => {
    const { logging } = loadLogging();
    logging.setConsoleTimestampPrefix(true);
    logging.enableConsoleCapture();
    const { getConsoleSettings } = logging;
    getConsoleSettings();
    expect(loadConfigCalls).toBe(1);
  });

  it("skips config fallback during re-entrant resolution", () => {
    const { logging, state } = loadLogging();
    state.loggingState.resolvingConsoleSettings = true;
    logging.setConsoleTimestampPrefix(true);
    logging.enableConsoleCapture();
    logging.getConsoleSettings();
    expect(loadConfigCalls).toBe(0);
    state.loggingState.resolvingConsoleSettings = false;
  });
});
