import { describe, expect, it, vi } from "vitest";
import { isUnhandledRejectionHandled } from "../../../src/infra/unhandled-rejections.js";
import {
  isFeishuSdkUnhandledRejection,
  registerFeishuWsUnhandledRejectionGuard,
} from "./monitor.unhandled-rejection.js";

// A representative stack for the malformed-frame crash class: a protobuf decode
// failure thrown inside the vendored Lark SDK's bundled index.js.
const SDK_STACK = [
  "RangeError: index out of range: 42 + 8 > 40",
  "    at Reader.uint32 (/repo/node_modules/@larksuiteoapi/node-sdk/lib/index.js:1:1)",
  "    at Frame.decode (/repo/node_modules/@larksuiteoapi/node-sdk/lib/index.js:84871:1)",
  "    at decode (/repo/node_modules/@larksuiteoapi/node-sdk/lib/index.js:85150:1)",
].join("\n");

function sdkError(): Error {
  const err = new Error("index out of range");
  err.stack = SDK_STACK;
  return err;
}

function foreignError(): Error {
  const err = new Error("genuine bug");
  err.stack = "Error: genuine bug\n    at handler (/repo/src/gateway/server.js:2:2)";
  return err;
}

describe("isFeishuSdkUnhandledRejection", () => {
  it("matches an error thrown inside the Lark SDK", () => {
    expect(isFeishuSdkUnhandledRejection(sdkError())).toBe(true);
  });

  it("ignores an error thrown outside the Lark SDK", () => {
    expect(isFeishuSdkUnhandledRejection(foreignError())).toBe(false);
  });

  it("ignores non-Error reasons and stackless errors", () => {
    expect(isFeishuSdkUnhandledRejection("not an error")).toBe(false);
    expect(isFeishuSdkUnhandledRejection(undefined)).toBe(false);
    expect(isFeishuSdkUnhandledRejection(null)).toBe(false);
    const stackless = new Error("no stack");
    stackless.stack = undefined;
    expect(isFeishuSdkUnhandledRejection(stackless)).toBe(false);
  });
});

describe("registerFeishuWsUnhandledRejectionGuard", () => {
  it("suppresses SDK-origin rejections through the central handler only while registered", () => {
    const log = vi.fn();

    // Nothing suppresses the SDK error before the guard is registered.
    expect(isUnhandledRejectionHandled(sdkError())).toBe(false);

    const unregister = registerFeishuWsUnhandledRejectionGuard("acct-1", log);
    try {
      // A malformed-frame rejection is now handled — it won't reach process.exit(1).
      expect(isUnhandledRejectionHandled(sdkError())).toBe(true);
      expect(log).toHaveBeenCalledTimes(1);
      expect(log.mock.calls[0]?.[0]).toContain("feishu[acct-1]");
      // A genuine unrelated rejection is still NOT suppressed — it must crash as before.
      expect(isUnhandledRejectionHandled(foreignError())).toBe(false);
    } finally {
      unregister();
    }

    // After unregister the guard no longer suppresses anything.
    expect(isUnhandledRejectionHandled(sdkError())).toBe(false);
  });
});
