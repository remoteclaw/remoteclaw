import { describe, expect, it } from "vitest";
import type { CronDelivery, CronPayload, CronSessionTarget } from "../../cron/types.js";
import {
  assertValidCronAnnounceDelivery,
  assertValidCronCreateDelivery,
  assertValidCronUpdateDelivery,
  CronDeliveryValidationError,
  type CronDeliveryValidationInput,
  isCronDeliveryValidationError,
} from "./cron.validation.js";

const AGENT_TURN: CronPayload = { kind: "agentTurn", message: "hello" };
const SYSTEM_EVENT: CronPayload = { kind: "systemEvent", text: "hello" };

function job(params: {
  sessionTarget?: CronSessionTarget;
  payload?: CronPayload;
  delivery?: CronDelivery;
}): CronDeliveryValidationInput {
  return {
    sessionTarget: params.sessionTarget ?? "isolated",
    payload: params.payload ?? AGENT_TURN,
    delivery: params.delivery,
  };
}

const TWO_CHANNELS = ["telegram", "slack"];
const ONE_CHANNEL = ["telegram"];
const NO_CHANNELS: string[] = [];

describe("assertValidCronCreateDelivery", () => {
  describe("ambiguous announce delivery is rejected when multiple channels are configured", () => {
    it("rejects an explicit announce delivery without a channel", () => {
      expect(() =>
        assertValidCronCreateDelivery(job({ delivery: { mode: "announce" } }), TWO_CHANNELS),
      ).toThrow(CronDeliveryValidationError);
    });

    it('rejects an announce delivery whose channel is "last"', () => {
      expect(() =>
        assertValidCronCreateDelivery(
          job({ delivery: { mode: "announce", channel: "last" } }),
          TWO_CHANNELS,
        ),
      ).toThrow(/delivery\.channel is ambiguous/);
    });

    it("rejects an implicit announce delivery (isolated agentTurn, no delivery)", () => {
      expect(() =>
        assertValidCronCreateDelivery(
          job({ sessionTarget: "isolated", payload: AGENT_TURN }),
          TWO_CHANNELS,
        ),
      ).toThrow(CronDeliveryValidationError);
    });

    it("rejects an ambiguous failure destination", () => {
      expect(() =>
        assertValidCronCreateDelivery(
          job({
            delivery: {
              mode: "announce",
              channel: "telegram",
              to: "123",
              failureDestination: { mode: "announce" },
            },
          }),
          TWO_CHANNELS,
        ),
      ).toThrow(/delivery\.failureDestination\.channel is ambiguous/);
    });

    it("lists the configured channels (sorted) in the error message", () => {
      try {
        assertValidCronCreateDelivery(job({ delivery: { mode: "announce" } }), [
          "slack",
          "telegram",
        ]);
        throw new Error("expected validation to throw");
      } catch (err) {
        expect(isCronDeliveryValidationError(err)).toBe(true);
        expect((err as CronDeliveryValidationError).message).toContain("slack, telegram");
      }
    });
  });

  describe("unambiguous or single-channel deliveries are accepted", () => {
    it("accepts a named channel even with multiple channels configured", () => {
      expect(() =>
        assertValidCronCreateDelivery(
          job({ delivery: { mode: "announce", channel: "telegram", to: "123" } }),
          TWO_CHANNELS,
        ),
      ).not.toThrow();
    });

    it("accepts an absent channel when only one channel is configured", () => {
      expect(() =>
        assertValidCronCreateDelivery(job({ delivery: { mode: "announce" } }), ONE_CHANNEL),
      ).not.toThrow();
    });

    it("accepts an absent channel when no channels are configured", () => {
      expect(() =>
        assertValidCronCreateDelivery(job({ delivery: { mode: "announce" } }), NO_CHANNELS),
      ).not.toThrow();
    });

    it("accepts a named failure destination channel", () => {
      expect(() =>
        assertValidCronCreateDelivery(
          job({
            delivery: {
              mode: "announce",
              channel: "telegram",
              to: "123",
              failureDestination: { mode: "announce", channel: "slack", to: "456" },
            },
          }),
          TWO_CHANNELS,
        ),
      ).not.toThrow();
    });
  });

  describe("non-announce deliveries carry no announce channel", () => {
    it("accepts webhook delivery regardless of configured channels", () => {
      expect(() =>
        assertValidCronCreateDelivery(
          job({ delivery: { mode: "webhook", to: "https://example.invalid/hook" } }),
          TWO_CHANNELS,
        ),
      ).not.toThrow();
    });

    it("accepts a webhook failure destination without a channel", () => {
      expect(() =>
        assertValidCronCreateDelivery(
          job({
            delivery: {
              mode: "announce",
              channel: "telegram",
              to: "123",
              failureDestination: { mode: "webhook", to: "https://example.invalid/fail" },
            },
          }),
          TWO_CHANNELS,
        ),
      ).not.toThrow();
    });

    it('accepts delivery mode "none"', () => {
      expect(() =>
        assertValidCronCreateDelivery(job({ delivery: { mode: "none" } }), TWO_CHANNELS),
      ).not.toThrow();
    });
  });

  describe("announce delivery is only validated for isolated-like session targets", () => {
    it("skips main session targets (announce delivery is rejected/stripped elsewhere)", () => {
      expect(() =>
        assertValidCronCreateDelivery(
          job({ sessionTarget: "main", payload: SYSTEM_EVENT, delivery: { mode: "announce" } }),
          TWO_CHANNELS,
        ),
      ).not.toThrow();
    });

    it("validates current session targets", () => {
      expect(() =>
        assertValidCronCreateDelivery(
          job({ sessionTarget: "current", delivery: { mode: "announce" } }),
          TWO_CHANNELS,
        ),
      ).toThrow(CronDeliveryValidationError);
    });

    it("validates session:<id> targets", () => {
      expect(() =>
        assertValidCronCreateDelivery(
          job({ sessionTarget: "session:project-alpha", delivery: { mode: "announce" } }),
          TWO_CHANNELS,
        ),
      ).toThrow(CronDeliveryValidationError);
    });

    it("does not treat a main systemEvent job (no delivery) as implicit announce", () => {
      expect(() =>
        assertValidCronCreateDelivery(
          job({ sessionTarget: "main", payload: SYSTEM_EVENT, delivery: undefined }),
          TWO_CHANNELS,
        ),
      ).not.toThrow();
    });
  });
});

describe("assertValidCronUpdateDelivery", () => {
  it("rejects an ambiguous announce delivery in the merged patch", () => {
    expect(() =>
      assertValidCronUpdateDelivery(
        job({ delivery: { mode: "announce", channel: "last" } }),
        TWO_CHANNELS,
      ),
    ).toThrow(CronDeliveryValidationError);
  });

  it("accepts a named channel in the merged patch", () => {
    expect(() =>
      assertValidCronUpdateDelivery(
        job({ delivery: { mode: "announce", channel: "telegram", to: "123" } }),
        TWO_CHANNELS,
      ),
    ).not.toThrow();
  });

  it("does not infer implicit announce for updates (no delivery object)", () => {
    expect(() =>
      assertValidCronUpdateDelivery(
        job({ sessionTarget: "isolated", payload: AGENT_TURN, delivery: undefined }),
        TWO_CHANNELS,
      ),
    ).not.toThrow();
  });
});

describe("assertValidCronAnnounceDelivery", () => {
  it("honors the includeImplicit flag", () => {
    const isolatedNoDelivery = job({ sessionTarget: "isolated", payload: AGENT_TURN });
    expect(() =>
      assertValidCronAnnounceDelivery(isolatedNoDelivery, TWO_CHANNELS, { includeImplicit: false }),
    ).not.toThrow();
    expect(() =>
      assertValidCronAnnounceDelivery(isolatedNoDelivery, TWO_CHANNELS, { includeImplicit: true }),
    ).toThrow(CronDeliveryValidationError);
  });
});

describe("isCronDeliveryValidationError", () => {
  it("identifies CronDeliveryValidationError instances", () => {
    expect(isCronDeliveryValidationError(new CronDeliveryValidationError("x"))).toBe(true);
  });

  it("rejects other error types", () => {
    expect(isCronDeliveryValidationError(new Error("x"))).toBe(false);
    expect(isCronDeliveryValidationError(null)).toBe(false);
  });
});
