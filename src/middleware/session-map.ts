import fs from "node:fs";
import path from "node:path";
import type { SessionMapKey } from "./types.js";

type SessionEntry = { sessionId: string; updatedAt: number };
type SessionStore = Record<string, SessionEntry>;

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export class SessionMap {
  private readonly filePath: string;
  private readonly ttlMs: number;

  constructor(dir: string, ttlMs: number = DEFAULT_TTL_MS) {
    this.filePath = path.join(dir, "remoteclaw-sessions.json");
    this.ttlMs = ttlMs;
  }

  get(key: SessionMapKey): string | undefined {
    const store = this.load();
    const entry = store[this.toKey(key)];
    if (!entry) {
      return undefined;
    }
    if (Date.now() - entry.updatedAt > this.ttlMs) {
      return undefined;
    }
    return entry.sessionId;
  }

  set(key: SessionMapKey, sessionId: string): void {
    const store = this.load();
    this.evictExpired(store);
    store[this.toKey(key)] = { sessionId, updatedAt: Date.now() };
    this.save(store);
  }

  delete(key: SessionMapKey): void {
    const store = this.load();
    const k = this.toKey(key);
    if (k in store) {
      delete store[k];
      this.save(store);
    }
  }

  private toKey(key: SessionMapKey): string {
    return `${key.channelId}:${key.userId}:${key.threadId ?? "_"}`;
  }

  private load(): SessionStore {
    try {
      const raw = fs.readFileSync(this.filePath, "utf-8");
      return JSON.parse(raw) as SessionStore;
    } catch {
      return {};
    }
  }

  private save(store: SessionStore): void {
    const dir = path.dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = path.join(dir, `.tmp.${Date.now()}`);
    fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
    fs.renameSync(tmp, this.filePath);
  }

  private evictExpired(store: SessionStore): void {
    const now = Date.now();
    for (const k of Object.keys(store)) {
      if (now - store[k].updatedAt > this.ttlMs) {
        delete store[k];
      }
    }
  }
}
