import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SessionMap } from "./session-map.js";

describe("SessionMap", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "session-map-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const key = { channelId: "tg", userId: "u1", threadId: undefined };
  const keyWithThread = { channelId: "tg", userId: "u1", threadId: "t1" };

  it("returns undefined for unknown key", () => {
    const map = new SessionMap(tmpDir);
    expect(map.get(key)).toBeUndefined();
  });

  it("stores and retrieves a session ID", () => {
    const map = new SessionMap(tmpDir);
    map.set(key, "session-abc");
    expect(map.get(key)).toBe("session-abc");
  });

  it("distinguishes keys with and without threadId", () => {
    const map = new SessionMap(tmpDir);
    map.set(key, "no-thread");
    map.set(keyWithThread, "with-thread");
    expect(map.get(key)).toBe("no-thread");
    expect(map.get(keyWithThread)).toBe("with-thread");
  });

  it("deletes a session entry", () => {
    const map = new SessionMap(tmpDir);
    map.set(key, "to-delete");
    map.delete(key);
    expect(map.get(key)).toBeUndefined();
  });

  it("delete is a no-op for missing key", () => {
    const map = new SessionMap(tmpDir);
    expect(() => map.delete(key)).not.toThrow();
  });

  it("persists across instances", () => {
    const map1 = new SessionMap(tmpDir);
    map1.set(key, "persistent");
    const map2 = new SessionMap(tmpDir);
    expect(map2.get(key)).toBe("persistent");
  });

  it("evicts expired entries on set", () => {
    const map = new SessionMap(tmpDir, 1); // 1ms TTL

    // Write directly with an old timestamp so the entry is already expired
    const filePath = path.join(tmpDir, "remoteclaw-sessions.json");
    const store = { "tg:u1:_": { sessionId: "old-session", updatedAt: Date.now() - 1000 } };
    fs.writeFileSync(filePath, JSON.stringify(store));

    // Setting a new key should evict the expired entry
    map.set(keyWithThread, "new-session");

    // The expired entry should have been removed from the file
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    expect(raw["tg:u1:_"]).toBeUndefined();
    expect(raw["tg:u1:t1"]).toBeDefined();
  });

  it("returns undefined for expired entries", () => {
    const map = new SessionMap(tmpDir, 1); // 1ms TTL

    // Write directly with an old timestamp
    const filePath = path.join(tmpDir, "remoteclaw-sessions.json");
    const store = { "tg:u1:_": { sessionId: "expired", updatedAt: Date.now() - 1000 } };
    fs.writeFileSync(filePath, JSON.stringify(store));

    expect(map.get(key)).toBeUndefined();
  });

  it("handles corrupted file gracefully", () => {
    const filePath = path.join(tmpDir, "remoteclaw-sessions.json");
    fs.writeFileSync(filePath, "NOT VALID JSON{{{{");
    const map = new SessionMap(tmpDir);
    expect(map.get(key)).toBeUndefined();

    // Can still write after corruption
    map.set(key, "recovered");
    expect(map.get(key)).toBe("recovered");
  });

  it("handles missing directory gracefully", () => {
    const deepDir = path.join(tmpDir, "nested", "dir");
    const map = new SessionMap(deepDir);
    expect(map.get(key)).toBeUndefined();

    // Creates dir on write
    map.set(key, "deep");
    expect(map.get(key)).toBe("deep");
  });
});
