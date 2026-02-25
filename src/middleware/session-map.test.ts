import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type SessionEntry, type SessionKey, SessionMap } from "./session-map.js";

describe("SessionMap", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "session-map-test-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  // ── CRUD Operations ─────────────────────────────────────────────────

  describe("CRUD operations", () => {
    it("get() returns undefined for unknown key", async () => {
      const map = new SessionMap(dir);
      const result = await map.get({ channelId: "c1", userId: "u1" });
      expect(result).toBeUndefined();
    });

    it("set() + get() round-trip stores and retrieves a session ID", async () => {
      const map = new SessionMap(dir);
      const key: SessionKey = {
        channelId: "telegram-123",
        userId: "user-42",
        threadId: "thread-99",
      };
      await map.set(key, "sess_abc123");
      const result = await map.get(key);
      expect(result).toBe("sess_abc123");
    });

    it("set() overwrites an existing entry", async () => {
      const map = new SessionMap(dir);
      const key: SessionKey = { channelId: "c1", userId: "u1" };
      await map.set(key, "sess_old");
      await map.set(key, "sess_new");
      expect(await map.get(key)).toBe("sess_new");
    });

    it("thread isolation: same channelId + userId but different threadId → different sessions", async () => {
      const map = new SessionMap(dir);
      const key1: SessionKey = { channelId: "c1", userId: "u1", threadId: "t1" };
      const key2: SessionKey = { channelId: "c1", userId: "u1", threadId: "t2" };
      await map.set(key1, "sess_thread1");
      await map.set(key2, "sess_thread2");
      expect(await map.get(key1)).toBe("sess_thread1");
      expect(await map.get(key2)).toBe("sess_thread2");
    });

    it("delete() removes an entry", async () => {
      const map = new SessionMap(dir);
      const key: SessionKey = { channelId: "c1", userId: "u1" };
      await map.set(key, "sess_123");
      await map.delete(key);
      expect(await map.get(key)).toBeUndefined();
    });

    it("delete() is a no-op for missing key", async () => {
      const map = new SessionMap(dir);
      // Should not throw
      await expect(map.delete({ channelId: "c1", userId: "u1" })).resolves.toBeUndefined();
    });
  });

  // ── Persistence ─────────────────────────────────────────────────────

  describe("persistence", () => {
    it("data survives across SessionMap instances using the same directory", async () => {
      const mapA = new SessionMap(dir);
      const key: SessionKey = { channelId: "c1", userId: "u1", threadId: "t1" };
      await mapA.set(key, "sess_persistent");

      const mapB = new SessionMap(dir);
      expect(await mapB.get(key)).toBe("sess_persistent");
    });
  });

  // ── TTL Expiration ──────────────────────────────────────────────────

  describe("TTL expiration", () => {
    it("get() returns undefined for an expired entry", async () => {
      const map = new SessionMap(dir, 1); // 1ms TTL
      const key: SessionKey = { channelId: "c1", userId: "u1" };
      await map.set(key, "sess_expired");

      // Wait for TTL to elapse
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(await map.get(key)).toBeUndefined();
    });

    it("expired entries are evicted on the next set() call", async () => {
      const map = new SessionMap(dir, 1); // 1ms TTL
      const expiredKey: SessionKey = { channelId: "c1", userId: "u1" };
      await map.set(expiredKey, "sess_old");

      // Wait for TTL to elapse
      await new Promise((resolve) => setTimeout(resolve, 10));

      // set() with a different key should evict the expired entry
      const freshKey: SessionKey = { channelId: "c2", userId: "u2" };
      await map.set(freshKey, "sess_fresh");

      // Read the raw file to verify the expired entry was removed
      const raw = readFileSync(join(dir, "remoteclaw-sessions.json"), "utf-8");
      const store = JSON.parse(raw) as Record<string, SessionEntry>;
      expect(store["c1:u1:_"]).toBeUndefined();
      expect(store["c2:u2:_"]).toBeDefined();
    });

    it("uses 7-day default TTL when none specified", async () => {
      const now = Date.now();
      vi.spyOn(Date, "now").mockReturnValue(now);

      const map = new SessionMap(dir);
      const key: SessionKey = { channelId: "c1", userId: "u1" };
      await map.set(key, "sess_default_ttl");

      // Just before expiration: should still be valid
      vi.spyOn(Date, "now").mockReturnValue(now + 604_800_000 - 1);
      expect(await map.get(key)).toBe("sess_default_ttl");

      // Past expiration: should be expired
      vi.spyOn(Date, "now").mockReturnValue(now + 604_800_000 + 1);
      expect(await map.get(key)).toBeUndefined();
    });
  });

  // ── Resilience ──────────────────────────────────────────────────────

  describe("resilience", () => {
    it("get() returns undefined when JSON file is corrupted", async () => {
      writeFileSync(join(dir, "remoteclaw-sessions.json"), "NOT VALID JSON{{{");
      const map = new SessionMap(dir);
      expect(await map.get({ channelId: "c1", userId: "u1" })).toBeUndefined();
    });

    it("set() recovers from corrupted JSON file and writes new data", async () => {
      writeFileSync(join(dir, "remoteclaw-sessions.json"), "CORRUPT");
      const map = new SessionMap(dir);
      const key: SessionKey = { channelId: "c1", userId: "u1" };
      await map.set(key, "sess_recovered");
      expect(await map.get(key)).toBe("sess_recovered");
    });

    it("set() creates missing directory", async () => {
      const nested = join(dir, "deep", "nested", "dir");
      const map = new SessionMap(nested);
      const key: SessionKey = { channelId: "c1", userId: "u1" };
      await map.set(key, "sess_nested");
      expect(await map.get(key)).toBe("sess_nested");
    });

    it.each(["null", "42", '"hello"', "[]", "true"])(
      "get() returns undefined when file contains valid but non-object JSON: %s",
      async (content) => {
        writeFileSync(join(dir, "remoteclaw-sessions.json"), content);
        const map = new SessionMap(dir);
        expect(await map.get({ channelId: "c1", userId: "u1" })).toBeUndefined();
      },
    );

    it("set() recovers from valid but non-object JSON and writes new data", async () => {
      writeFileSync(join(dir, "remoteclaw-sessions.json"), "null");
      const map = new SessionMap(dir);
      const key: SessionKey = { channelId: "c1", userId: "u1" };
      await map.set(key, "sess_from_null");
      expect(await map.get(key)).toBe("sess_from_null");
    });

    it("get() returns undefined when file does not exist", async () => {
      const empty = join(dir, "empty-subdir");
      const map = new SessionMap(empty);
      expect(await map.get({ channelId: "c1", userId: "u1" })).toBeUndefined();
    });
  });

  // ── Key Composition ─────────────────────────────────────────────────

  describe("key composition", () => {
    it("composes key as channelId:userId:threadId", async () => {
      const map = new SessionMap(dir);
      const key: SessionKey = {
        channelId: "telegram-12345",
        userId: "user-42",
        threadId: "thread-99",
      };
      await map.set(key, "sess_threaded");

      const raw = readFileSync(join(dir, "remoteclaw-sessions.json"), "utf-8");
      const store = JSON.parse(raw) as Record<string, SessionEntry>;
      expect(store["telegram-12345:user-42:thread-99"]).toBeDefined();
      expect(store["telegram-12345:user-42:thread-99"].sessionId).toBe("sess_threaded");
    });

    it("composes threadless key as channelId:userId:_ when threadId is undefined", async () => {
      const map = new SessionMap(dir);
      const key: SessionKey = { channelId: "discord-67890", userId: "user-7" };
      await map.set(key, "sess_threadless");

      const raw = readFileSync(join(dir, "remoteclaw-sessions.json"), "utf-8");
      const store = JSON.parse(raw) as Record<string, SessionEntry>;
      expect(store["discord-67890:user-7:_"]).toBeDefined();
      expect(store["discord-67890:user-7:_"].sessionId).toBe("sess_threadless");
    });

    it("treats explicit undefined threadId the same as omitted threadId", async () => {
      const map = new SessionMap(dir);
      const key1: SessionKey = { channelId: "c1", userId: "u1", threadId: undefined };
      const key2: SessionKey = { channelId: "c1", userId: "u1" };
      await map.set(key1, "sess_explicit_undef");
      expect(await map.get(key2)).toBe("sess_explicit_undef");
    });
  });
});
