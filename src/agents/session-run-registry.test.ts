import { afterEach, describe, expect, it } from "vitest";
import {
  getActiveSessionRunCount,
  getSessionRunHandle,
  isSessionRunActive,
  killSessionRun,
  registerSessionRun,
  resetSessionRunRegistryForTest,
  unregisterSessionRun,
  waitForSessionRunEnd,
} from "./session-run-registry.js";

describe("session-run-registry", () => {
  afterEach(() => {
    resetSessionRunRegistryForTest();
  });

  it("returns false for unknown session key", () => {
    expect(isSessionRunActive("unknown:key")).toBe(false);
  });

  it("returns true after registering a session run", () => {
    registerSessionRun("session-1", {
      startedAt: Date.now(),
      sessionKey: "session-1",
      agentId: "main",
    });
    expect(isSessionRunActive("session-1")).toBe(true);
  });

  it("returns false after unregistering a session run", () => {
    registerSessionRun("session-1", {
      startedAt: Date.now(),
      sessionKey: "session-1",
      agentId: "main",
    });
    unregisterSessionRun("session-1");
    expect(isSessionRunActive("session-1")).toBe(false);
  });

  it("tracks correct count for multiple concurrent sessions", () => {
    expect(getActiveSessionRunCount()).toBe(0);

    registerSessionRun("session-a", {
      startedAt: Date.now(),
      sessionKey: "session-a",
      agentId: "main",
    });
    expect(getActiveSessionRunCount()).toBe(1);

    registerSessionRun("session-b", {
      startedAt: Date.now(),
      sessionKey: "session-b",
      agentId: "claude",
    });
    expect(getActiveSessionRunCount()).toBe(2);

    unregisterSessionRun("session-a");
    expect(getActiveSessionRunCount()).toBe(1);

    unregisterSessionRun("session-b");
    expect(getActiveSessionRunCount()).toBe(0);
  });

  it("unregister is a no-op for unknown keys", () => {
    unregisterSessionRun("nonexistent");
    expect(getActiveSessionRunCount()).toBe(0);
  });

  it("cleanup works via finally pattern (simulated crash)", () => {
    const sessionKey = "crash-test";
    registerSessionRun(sessionKey, {
      startedAt: Date.now(),
      sessionKey,
      agentId: "main",
    });
    expect(isSessionRunActive(sessionKey)).toBe(true);

    try {
      throw new Error("simulated crash");
    } catch {
      // swallow
    } finally {
      unregisterSessionRun(sessionKey);
    }
    expect(isSessionRunActive(sessionKey)).toBe(false);
  });

  it("overwrite on re-register with same key", () => {
    registerSessionRun("session-1", {
      startedAt: 1000,
      sessionKey: "session-1",
      agentId: "first",
    });
    registerSessionRun("session-1", {
      startedAt: 2000,
      sessionKey: "session-1",
      agentId: "second",
    });
    expect(getActiveSessionRunCount()).toBe(1);
    expect(isSessionRunActive("session-1")).toBe(true);
  });

  describe("getSessionRunHandle", () => {
    it("returns undefined for unknown key", () => {
      expect(getSessionRunHandle("unknown")).toBeUndefined();
    });

    it("returns the registered handle", () => {
      registerSessionRun("session-1", {
        startedAt: 1000,
        sessionKey: "session-1",
        agentId: "main",
      });
      const handle = getSessionRunHandle("session-1");
      expect(handle).toBeDefined();
      expect(handle!.startedAt).toBe(1000);
      expect(handle!.agentId).toBe("main");
    });
  });

  describe("killSessionRun", () => {
    it("returns false for unknown key", () => {
      expect(killSessionRun("unknown")).toBe(false);
    });

    it("aborts via AbortController when present", () => {
      const ctrl = new AbortController();
      registerSessionRun("session-1", {
        startedAt: Date.now(),
        sessionKey: "session-1",
        agentId: "main",
        abortController: ctrl,
      });
      expect(ctrl.signal.aborted).toBe(false);
      expect(killSessionRun("session-1")).toBe(true);
      expect(ctrl.signal.aborted).toBe(true);
    });

    it("returns false when AbortController is already aborted and no PID", () => {
      const ctrl = new AbortController();
      ctrl.abort();
      registerSessionRun("session-1", {
        startedAt: Date.now(),
        sessionKey: "session-1",
        agentId: "main",
        abortController: ctrl,
      });
      expect(killSessionRun("session-1")).toBe(false);
    });
  });

  describe("waitForSessionRunEnd", () => {
    it("resolves true immediately when no active run", async () => {
      const result = await waitForSessionRunEnd("unknown", 100);
      expect(result).toBe(true);
    });

    it("resolves true when run is unregistered before timeout", async () => {
      registerSessionRun("session-1", {
        startedAt: Date.now(),
        sessionKey: "session-1",
        agentId: "main",
      });
      setTimeout(() => unregisterSessionRun("session-1"), 30);
      const result = await waitForSessionRunEnd("session-1", 500);
      expect(result).toBe(true);
    });

    it("resolves false on timeout", async () => {
      registerSessionRun("session-1", {
        startedAt: Date.now(),
        sessionKey: "session-1",
        agentId: "main",
      });
      const result = await waitForSessionRunEnd("session-1", 80);
      expect(result).toBe(false);
    });
  });
});
