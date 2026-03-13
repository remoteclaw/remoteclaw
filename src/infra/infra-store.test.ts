import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withTempDir } from "../test-utils/temp-dir.js";
import {
  getChannelActivity,
  recordChannelActivity,
  resetChannelActivityForTest,
} from "./channel-activity.js";
import {
  emitDiagnosticEvent,
  onDiagnosticEvent,
  resetDiagnosticEventsForTest,
} from "./diagnostic-events.js";
import { readSessionStoreJson5 } from "./state-migrations.fs.js";

describe("infra store", () => {
  describe("state migrations fs", () => {
    it("treats array session stores as invalid", async () => {
      await withTempDir("remoteclaw-session-store-", async (dir) => {
        const storePath = path.join(dir, "sessions.json");
        await fs.writeFile(storePath, "[]", "utf-8");

        const result = readSessionStoreJson5(storePath);
        expect(result.ok).toBe(false);
        expect(result.store).toEqual({});
      });
    });

    it("parses JSON5 object session stores", async () => {
      await withTempDir("remoteclaw-session-store-", async (dir) => {
        const storePath = path.join(dir, "sessions.json");
        await fs.writeFile(
          storePath,
          "{\n  // comment allowed in JSON5\n  main: { sessionId: 's1', updatedAt: 123 },\n}\n",
          "utf-8",
        );

        const result = readSessionStoreJson5(storePath);
        expect(result.ok).toBe(true);
        expect(result.store.main?.sessionId).toBe("s1");
        expect(result.store.main?.updatedAt).toBe(123);
      });
    });
  });

  describe("diagnostic-events", () => {
    it("emits monotonic seq", async () => {
      resetDiagnosticEventsForTest();
      const seqs: number[] = [];
      const stop = onDiagnosticEvent((evt) => seqs.push(evt.seq));

      emitDiagnosticEvent({
        type: "model.usage",
        usage: { total: 1 },
      });
      emitDiagnosticEvent({
        type: "model.usage",
        usage: { total: 2 },
      });

      stop();

      expect(seqs).toEqual([1, 2]);
    });

    it("emits message-flow events", async () => {
      resetDiagnosticEventsForTest();
      const types: string[] = [];
      const stop = onDiagnosticEvent((evt) => types.push(evt.type));

      emitDiagnosticEvent({
        type: "webhook.received",
        channel: "telegram",
        updateType: "telegram-post",
      });
      emitDiagnosticEvent({
        type: "message.queued",
        channel: "telegram",
        source: "telegram",
        queueDepth: 1,
      });
      emitDiagnosticEvent({
        type: "session.state",
        state: "processing",
        reason: "run_started",
      });

      stop();

      expect(types).toEqual(["webhook.received", "message.queued", "session.state"]);
    });
  });

  describe("channel activity", () => {
    beforeEach(() => {
      resetChannelActivityForTest();
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-08T00:00:00Z"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("records inbound/outbound separately", () => {
      recordChannelActivity({ channel: "telegram", direction: "inbound" });
      vi.advanceTimersByTime(1000);
      recordChannelActivity({ channel: "telegram", direction: "outbound" });
      const res = getChannelActivity({ channel: "telegram" });
      expect(res.inboundAt).toBe(1767830400000);
      expect(res.outboundAt).toBe(1767830401000);
    });

    it("isolates accounts", () => {
      recordChannelActivity({
        channel: "whatsapp",
        accountId: "a",
        direction: "inbound",
        at: 1,
      });
      recordChannelActivity({
        channel: "whatsapp",
        accountId: "b",
        direction: "inbound",
        at: 2,
      });
      expect(getChannelActivity({ channel: "whatsapp", accountId: "a" })).toEqual({
        inboundAt: 1,
        outboundAt: null,
      });
      expect(getChannelActivity({ channel: "whatsapp", accountId: "b" })).toEqual({
        inboundAt: 2,
        outboundAt: null,
      });
    });
  });
});
