import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { emitDiagnosticEvent, resetDiagnosticEventsForTest } from "../infra/diagnostic-events.js";
import {
  getRoutingDropCounts,
  installRoutingDropsAccumulator,
  resetRoutingDropsAccumulatorForTest,
} from "./routing-drops-accumulator.js";

describe("routing-drops-accumulator", () => {
  beforeEach(() => {
    resetDiagnosticEventsForTest();
    resetRoutingDropsAccumulatorForTest();
  });

  afterEach(() => {
    resetRoutingDropsAccumulatorForTest();
    resetDiagnosticEventsForTest();
  });

  test("starts with zero counts", () => {
    installRoutingDropsAccumulator();
    const counts = getRoutingDropCounts();
    expect(counts.total).toBe(0);
    expect(counts.byChannel).toEqual({});
    expect(counts.byReason).toEqual({});
  });

  test("increments total on routing.drop diagnostic event", () => {
    installRoutingDropsAccumulator();
    emitDiagnosticEvent({
      type: "routing.drop",
      channel: "telegram",
      reason: "unmatched",
      scope: {
        channel: "telegram",
        accountId: "default",
        peer: { kind: "direct", id: "+1555" },
        guildId: null,
        teamId: null,
      },
      configuredAgents: ["ops", "dev"],
    });
    const counts = getRoutingDropCounts();
    expect(counts.total).toBe(1);
    expect(counts.byChannel).toEqual({ telegram: 1 });
    expect(counts.byReason).toEqual({ unmatched: 1 });
  });

  test("aggregates counts across channels and reasons", () => {
    installRoutingDropsAccumulator();
    const baseScope = {
      accountId: "default",
      peer: null,
      guildId: null,
      teamId: null,
    };
    emitDiagnosticEvent({
      type: "routing.drop",
      channel: "telegram",
      reason: "unmatched",
      scope: { channel: "telegram", ...baseScope },
      configuredAgents: [],
    });
    emitDiagnosticEvent({
      type: "routing.drop",
      channel: "telegram",
      reason: "unmatched",
      scope: { channel: "telegram", ...baseScope },
      configuredAgents: [],
    });
    emitDiagnosticEvent({
      type: "routing.drop",
      channel: "slack",
      reason: "unmatched",
      scope: { channel: "slack", ...baseScope },
      configuredAgents: [],
    });
    const counts = getRoutingDropCounts();
    expect(counts.total).toBe(3);
    expect(counts.byChannel).toEqual({ telegram: 2, slack: 1 });
    expect(counts.byReason).toEqual({ unmatched: 3 });
  });

  test("ignores unrelated diagnostic events", () => {
    installRoutingDropsAccumulator();
    emitDiagnosticEvent({
      type: "webhook.received",
      channel: "telegram",
      updateType: "message",
    });
    const counts = getRoutingDropCounts();
    expect(counts.total).toBe(0);
  });

  test("install is idempotent — multiple calls do not duplicate counting", () => {
    installRoutingDropsAccumulator();
    installRoutingDropsAccumulator();
    installRoutingDropsAccumulator();
    emitDiagnosticEvent({
      type: "routing.drop",
      channel: "discord",
      reason: "unmatched",
      scope: {
        channel: "discord",
        accountId: "default",
        peer: null,
        guildId: "g1",
        teamId: null,
      },
      configuredAgents: [],
    });
    const counts = getRoutingDropCounts();
    expect(counts.total).toBe(1);
  });
});
