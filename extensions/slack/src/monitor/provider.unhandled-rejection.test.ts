import { describe, expect, it } from "vitest";
import { isUnhandledRejectionHandled } from "../../../../src/infra/unhandled-rejections.js";
import { __testing } from "./provider.js";

const { registerSlackSocketUnhandledRejectionHandler } = __testing;

// Mirror of the production constant (provider.ts SLACK_SOCKET_REJECTION_WINDOW_MS).
const SLACK_REJECTION_WINDOW_MS = 10_000;

/**
 * Minimal stand-in for the SocketModeClient (`app.receiver.client`) — same shape the existing
 * reconnect test uses. `getSocketEmitter` only needs `on`/`off`.
 */
class FakeSocketClient {
  private listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  on(event: string, listener: (...args: unknown[]) => void) {
    const bucket = this.listeners.get(event) ?? new Set<(...args: unknown[]) => void>();
    bucket.add(listener);
    this.listeners.set(event, bucket);
  }

  off(event: string, listener: (...args: unknown[]) => void) {
    this.listeners.get(event)?.delete(listener);
  }

  emit(event: string, ...args: unknown[]) {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(...args);
    }
  }
}

function setup(nowRef: { value: number }) {
  const client = new FakeSocketClient();
  const app = { receiver: { client } };
  const logs: string[] = [];
  const unregister = registerSlackSocketUnhandledRejectionHandler({
    app,
    log: (message) => logs.push(message),
    now: () => nowRef.value,
  });
  return { client, logs, unregister };
}

// The gateway's central handler runs `isUnhandledRejectionHandled(reason)` first and returns
// early — never reaching `process.exit(1)` — when any registered handler suppresses the rejection
// (src/infra/unhandled-rejections.ts). So `true` here means "the gateway does NOT crash" and
// `false` means "the gateway crashes" (the #2652 symptom).
describe("slack socket-mode unhandled rejection handler (#2652)", () => {
  it("suppresses a reasonless (undefined) rejection right after a socket disconnect", () => {
    const nowRef = { value: 1_000 };
    const { client, logs, unregister } = setup(nowRef);
    try {
      // The SDK emits State.Disconnected with no argument, then rejects with `undefined`.
      client.emit("disconnected");
      expect(isUnhandledRejectionHandled(undefined)).toBe(true);
      // Suppression must be observable.
      expect(logs).toHaveLength(1);
    } finally {
      unregister();
    }
  });

  it("suppresses a reasonless (null) rejection right after an error event", () => {
    const nowRef = { value: 1_000 };
    const { client, unregister } = setup(nowRef);
    try {
      client.emit("error", new Error("Unexpected server response: 408"));
      expect(isUnhandledRejectionHandled(null)).toBe(true);
    } finally {
      unregister();
    }
  });

  it("also tracks unable_to_socket_mode_start events", () => {
    const nowRef = { value: 1_000 };
    const { client, unregister } = setup(nowRef);
    try {
      client.emit("unable_to_socket_mode_start");
      expect(isUnhandledRejectionHandled(undefined)).toBe(true);
    } finally {
      unregister();
    }
  });

  it("does NOT suppress a reasonless rejection with no recent socket event", () => {
    const nowRef = { value: 1_000 };
    const { unregister } = setup(nowRef);
    try {
      // No socket lifecycle event fired — an unrelated reasonless rejection must still crash
      // (this is the pre-fix global behavior the tight scoping preserves).
      expect(isUnhandledRejectionHandled(undefined)).toBe(false);
    } finally {
      unregister();
    }
  });

  it("does NOT suppress a reasonless rejection once the correlation window elapses", () => {
    const nowRef = { value: 1_000 };
    const { client, unregister } = setup(nowRef);
    try {
      client.emit("disconnected");
      nowRef.value = 1_000 + SLACK_REJECTION_WINDOW_MS + 1; // just past the window
      expect(isUnhandledRejectionHandled(undefined)).toBe(false);
    } finally {
      unregister();
    }
  });

  it("suppresses a transient WebSocket upgrade error even without a recent socket event", () => {
    const nowRef = { value: 1_000 };
    const { unregister } = setup(nowRef);
    try {
      expect(isUnhandledRejectionHandled(new Error("Unexpected server response: 408"))).toBe(true);
    } finally {
      unregister();
    }
  });

  it("does NOT suppress a non-recoverable auth error wearing a WebSocket-upgrade message", () => {
    const nowRef = { value: 1_000 };
    const { unregister } = setup(nowRef);
    try {
      // Matches the upgrade regex (401) but is a permanent auth failure — must reach the fatal path.
      expect(
        isUnhandledRejectionHandled(new Error("Unexpected server response: 401 not_authed")),
      ).toBe(false);
    } finally {
      unregister();
    }
  });

  it("stops suppressing after unregister (finally-block cleanup)", () => {
    const nowRef = { value: 1_000 };
    const { client, unregister } = setup(nowRef);
    client.emit("disconnected");
    unregister();
    expect(isUnhandledRejectionHandled(undefined)).toBe(false);
  });
});
