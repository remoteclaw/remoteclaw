import { describe, expect, it } from "vitest";
import type { NormalizedUsage } from "../../agents/usage.js";
import type { AgentDeliveryResult } from "../../middleware/types.js";
import { surfaceCliSessionMeta } from "./agent-runner-execution.js";

// The ChannelBridge returns the CLI session ID only on `run.sessionId` and does
// NOT populate `meta.agentMeta` — the shape the auto-reply persistence path
// (agent-runner.ts → session-usage.ts) reads. Before surfaceCliSessionMeta the
// mapping was missing, so `cliSessionId` was always undefined, `cliSessionIds`
// stayed empty, and `--resume` never fired — every Slack message started a fresh
// CLI session. This is the value half of the #2786 fix (which keyed the map by
// the runtime but had no value to store). See #2786 / #2105.
function makeBridgeDelivery(
  runOverrides?: Partial<AgentDeliveryResult["run"]>,
  deliveryOverrides?: Partial<AgentDeliveryResult>,
): AgentDeliveryResult {
  return {
    payloads: [{ text: "hello" }],
    run: {
      text: "hello",
      sessionId: "892f0aa8-cli-session",
      durationMs: 1200,
      usage: { inputTokens: 10, outputTokens: 5 },
      aborted: false,
      ...runOverrides,
    },
    mcp: { sentTexts: [], sentMediaUrls: [], cronAdds: 0 },
    error: undefined,
    ...deliveryOverrides,
  } as AgentDeliveryResult;
}

describe("surfaceCliSessionMeta — auto-reply CLI session persistence (#2786 value half)", () => {
  it("surfaces run.sessionId as meta.agentMeta.sessionId (what the persist layer reads)", () => {
    const out = surfaceCliSessionMeta(makeBridgeDelivery());
    expect(out.meta?.agentMeta?.sessionId).toBe("892f0aa8-cli-session");
  });

  it("passes an undefined session ID through unchanged (new session, nothing to resume)", () => {
    const out = surfaceCliSessionMeta(makeBridgeDelivery({ sessionId: undefined }));
    expect(out.meta?.agentMeta?.sessionId).toBeUndefined();
  });

  it("does not disturb payloads, run, or error", () => {
    const out = surfaceCliSessionMeta(makeBridgeDelivery());
    expect(out.payloads).toHaveLength(1);
    expect(out.run.sessionId).toBe("892f0aa8-cli-session");
    expect(out.error).toBeUndefined();
  });

  it("preserves any pre-existing meta fields", () => {
    const out = surfaceCliSessionMeta(
      makeBridgeDelivery(undefined, { meta: { durationMs: 42, aborted: true } }),
    );
    expect(out.meta?.durationMs).toBe(42);
    expect(out.meta?.aborted).toBe(true);
    expect(out.meta?.agentMeta?.sessionId).toBe("892f0aa8-cli-session");
  });
});

describe("surfaceCliSessionMeta — usage normalization (#2801)", () => {
  it("surfaces run.usage normalized to NormalizedUsage (inputTokens→input, outputTokens→output)", () => {
    // The persistence layer reads meta.agentMeta.usage and treats it as
    // NormalizedUsage (input/output). run.usage is AgentUsage (inputTokens/…);
    // without normalization the field-name mismatch made every persisted count 0.
    const out = surfaceCliSessionMeta(makeBridgeDelivery());
    const usage = out.meta?.agentMeta?.usage as NormalizedUsage | undefined;
    expect(usage?.input).toBe(10);
    expect(usage?.output).toBe(5);
  });

  it("normalizes AgentUsage cache fields (cacheReadTokens→cacheRead, cacheWriteTokens→cacheWrite)", () => {
    // These camelCase cache aliases were the specific gap: normalizeUsage did not
    // recognize them, so cache counts persisted as zero even after usage surfaced.
    const out = surfaceCliSessionMeta(
      makeBridgeDelivery({
        usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 900, cacheWriteTokens: 20 },
      }),
    );
    const usage = out.meta?.agentMeta?.usage as NormalizedUsage | undefined;
    expect(usage?.input).toBe(100);
    expect(usage?.output).toBe(50);
    expect(usage?.cacheRead).toBe(900);
    expect(usage?.cacheWrite).toBe(20);
  });

  it("leaves agentMeta.usage undefined when the run reported no usage", () => {
    const out = surfaceCliSessionMeta(makeBridgeDelivery({ usage: undefined }));
    expect(out.meta?.agentMeta?.usage).toBeUndefined();
  });
});
