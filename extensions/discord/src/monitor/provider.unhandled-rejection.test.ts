import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { isUnhandledRejectionHandled } from "../../../../src/infra/unhandled-rejections.js";
import { __testing } from "./provider.js";

const { registerDiscordGatewayUnhandledRejectionHandler } = __testing;

// Mirror of the production constant (provider.ts DISCORD_GATEWAY_REJECTION_WINDOW_MS).
const DISCORD_GATEWAY_REJECTION_WINDOW_MS = 10_000;

/**
 * Reconstructs the message `createGatewayMetadataError` stamps on a NON-transient `/gateway/bot`
 * failure (gateway-plugin.ts) — the exact wrapper shape that escapes as an unhandled rejection from
 * Carbon's floating `registerClient` call.
 */
function gatewayMetadataError(detail: string): Error {
  return new Error(`Failed to get gateway information from Discord: ${detail}`);
}

/**
 * Minimal stand-in for the Carbon `Client`. `registerDiscordGatewayUnhandledRejectionHandler` only
 * needs `getPlugin("gateway")` to yield the gateway plugin's `emitter` (a real `EventEmitter`, as the
 * Carbon GatewayPlugin exposes) — same shape `attachEarlyGatewayErrorGuard`'s test relies on.
 */
function setup(nowRef: { value: number }) {
  const emitter = new EventEmitter();
  const client = { getPlugin: () => ({ emitter }) };
  const logs: string[] = [];
  const unregister = registerDiscordGatewayUnhandledRejectionHandler({
    client: client as never,
    log: (message) => logs.push(message),
    now: () => nowRef.value,
  });
  return { emitter, logs, unregister };
}

// The gateway's central handler runs `isUnhandledRejectionHandled(reason)` first and returns early —
// never reaching `process.exit(1)` — when any registered handler suppresses the rejection
// (src/infra/unhandled-rejections.ts). So `true` here means "the gateway does NOT crash" and `false`
// means "the gateway crashes" (the #2692 symptom).
describe("discord gateway-metadata unhandled rejection handler (#2692)", () => {
  it("suppresses a non-transient 429 gateway-metadata rejection at connect", () => {
    const nowRef = { value: 1_000 };
    const { logs, unregister } = setup(nowRef);
    try {
      const reason = gatewayMetadataError("Discord API /gateway/bot failed (429): rate limited");
      expect(isUnhandledRejectionHandled(reason)).toBe(true);
      // Suppression must be observable.
      expect(logs).toHaveLength(1);
    } finally {
      unregister();
    }
  });

  it("suppresses an invalid-JSON gateway-metadata rejection (proxy/Cloudflare interstitial)", () => {
    const nowRef = { value: 1_000 };
    const { unregister } = setup(nowRef);
    try {
      const reason = gatewayMetadataError(
        "Discord API /gateway/bot returned invalid JSON: <!DOCTYPE html><html>...",
      );
      expect(isUnhandledRejectionHandled(reason)).toBe(true);
    } finally {
      unregister();
    }
  });

  it("does NOT suppress a non-recoverable auth failure (401) — must reach the fatal path", () => {
    const nowRef = { value: 1_000 };
    const { unregister } = setup(nowRef);
    try {
      const reason = gatewayMetadataError(
        "Discord API /gateway/bot failed (401): 401: Unauthorized",
      );
      expect(isUnhandledRejectionHandled(reason)).toBe(false);
    } finally {
      unregister();
    }
  });

  it("does NOT suppress a 403 auth failure", () => {
    const nowRef = { value: 1_000 };
    const { unregister } = setup(nowRef);
    try {
      const reason = gatewayMetadataError("Discord API /gateway/bot failed (403): Missing Access");
      expect(isUnhandledRejectionHandled(reason)).toBe(false);
    } finally {
      unregister();
    }
  });

  it("does NOT suppress rejections without the gateway-metadata message (incl. reasonless)", () => {
    const nowRef = { value: 1_000 };
    const { unregister } = setup(nowRef);
    try {
      // Unrelated error — outside this handler's scope.
      expect(isUnhandledRejectionHandled(new Error("some unrelated failure"))).toBe(false);
      // Reasonless (undefined) rejections are Slack socket-mode's vector, not Discord's — this
      // handler must ignore them so it does not poach a different adapter's classification.
      expect(isUnhandledRejectionHandled(undefined)).toBe(false);
    } finally {
      unregister();
    }
  });

  it("does NOT suppress once the connect window elapses with no further gateway activity", () => {
    const nowRef = { value: 1_000 };
    const { unregister } = setup(nowRef);
    try {
      nowRef.value = 1_000 + DISCORD_GATEWAY_REJECTION_WINDOW_MS + 1; // just past the window
      const reason = gatewayMetadataError("Discord API /gateway/bot failed (429): rate limited");
      expect(isUnhandledRejectionHandled(reason)).toBe(false);
    } finally {
      unregister();
    }
  });

  it("refreshes the window on a Carbon gateway emitter error/debug event", () => {
    const nowRef = { value: 1_000 };
    const { emitter, unregister } = setup(nowRef);
    try {
      // Past the construction window...
      nowRef.value = 1_000 + DISCORD_GATEWAY_REJECTION_WINDOW_MS + 1;
      // ...but a fresh gateway lifecycle event re-stamps the window (GatewayPlugin emits "debug" on
      // reconnect, "error" on ws failure).
      emitter.emit("debug", "Reconnecting with backoff: 1000ms");
      const reason = gatewayMetadataError("Discord API /gateway/bot failed (429): rate limited");
      expect(isUnhandledRejectionHandled(reason)).toBe(true);
    } finally {
      unregister();
    }
  });

  it("stops suppressing after unregister (finally-block cleanup)", () => {
    const nowRef = { value: 1_000 };
    const { unregister } = setup(nowRef);
    unregister();
    const reason = gatewayMetadataError("Discord API /gateway/bot failed (429): rate limited");
    expect(isUnhandledRejectionHandled(reason)).toBe(false);
  });
});
