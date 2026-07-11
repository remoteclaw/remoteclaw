import { describe, expect, it } from "vitest";
import {
  resolveCronCurrentSessionTarget,
  resolveCronDeliverySessionKey,
  resolveCronFailureNotificationSessionKey,
  resolveCronNotificationSessionKey,
  resolveCronSessionTargetSessionKey,
} from "./session-target.js";

describe("cron session target helpers", () => {
  it("extracts and trims persistent session targets", () => {
    expect(resolveCronSessionTargetSessionKey("session: agent:main:telegram:direct:123 ")).toBe(
      "agent:main:telegram:direct:123",
    );
  });

  it("rejects native path separators in persistent session targets", () => {
    // Fork-stricter guard (assertSafeCronSessionTargetId): a `session:<id>`
    // target must not carry `/` or `\` so it cannot smuggle path traversal
    // (`session:../../outside`) into session-key/store resolution. Upstream
    // relaxed this to null-byte-only; the fork keeps the path-separator
    // rejection — adapt the fixture, do NOT relax the guard.
    expect(() =>
      resolveCronSessionTargetSessionKey(
        "session: agent:main:dingtalk:group:cid3tmd4xb19xjfk/wogxwy2a== ",
      ),
    ).toThrow("invalid cron sessionTarget session id");
    expect(() => resolveCronSessionTargetSessionKey("session:..\\outside")).toThrow(
      "invalid cron sessionTarget session id",
    );
    expect(() => resolveCronSessionTargetSessionKey("session:../../outside")).toThrow(
      "invalid cron sessionTarget session id",
    );
  });

  it("rejects null bytes in persistent session targets", () => {
    expect(() => resolveCronSessionTargetSessionKey("session:bad\0id")).toThrow(
      "invalid cron sessionTarget session id",
    );
  });

  it("resolves current targets to the creator session key", () => {
    expect(
      resolveCronCurrentSessionTarget({
        sessionTarget: "current",
        sessionKey: " agent:main:telegram:direct:123 ",
      }),
    ).toBe("session:agent:main:telegram:direct:123");
  });

  it("falls back current targets to isolated without a creator session key", () => {
    expect(resolveCronCurrentSessionTarget({ sessionTarget: "current" })).toBe("isolated");
  });

  it("prefers sessionTarget over creator sessionKey for delivery", () => {
    expect(
      resolveCronDeliverySessionKey({
        sessionTarget: "session:agent:main:telegram:direct:123",
        sessionKey: "agent:main:telegram:group:ops:sender:123",
      }),
    ).toBe("agent:main:telegram:direct:123");
  });

  it("falls back to trimmed creator sessionKey for delivery", () => {
    expect(
      resolveCronDeliverySessionKey({
        sessionTarget: "isolated",
        sessionKey: " agent:main:telegram:group:ops:sender:123 ",
      }),
    ).toBe("agent:main:telegram:group:ops:sender:123");
  });

  it("uses cron failure session fallback when no delivery session exists", () => {
    expect(resolveCronNotificationSessionKey({ jobId: "job-1", sessionKey: " " })).toBe(
      "cron:job-1:failure",
    );
    expect(
      resolveCronFailureNotificationSessionKey({ id: "job-2", sessionTarget: "isolated" }),
    ).toBe("cron:job-2:failure");
  });
});
