import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** Composite key for session lookup. */
export type SessionKey = {
  channelId: string;
  userId: string;
  threadId?: string | undefined;
};

/** Stored session entry. */
export type SessionEntry = {
  /** CLI runtime session ID (e.g., Claude session UUID, Codex thread ID). */
  sessionId: string;
  /** Epoch milliseconds of last access (set/get). */
  lastAccessMs: number;
};

const SESSION_FILE = "remoteclaw-sessions.json";
const DEFAULT_TTL_MS = 604_800_000; // 7 days

/**
 * File-backed session store mapping channel conversations to CLI runtime session IDs.
 *
 * Design decisions:
 * - No in-memory cache: every get/set/delete reads from and writes to disk
 * - Correctness over performance for the expected low-frequency session lookup pattern
 * - Lazy TTL eviction: expired entries are invisible on get(), evicted on next set()
 * - Atomic writes via write-to-temp + rename pattern
 */
export class SessionMap {
  readonly #directory: string;
  readonly #ttlMs: number;
  readonly #filePath: string;
  readonly #tmpPath: string;

  /**
   * @param directory - Directory where the session file is stored
   * @param ttlMs - Time-to-live in milliseconds (default: 7 days = 604_800_000)
   */
  constructor(directory: string, ttlMs?: number) {
    this.#directory = directory;
    this.#ttlMs = ttlMs ?? DEFAULT_TTL_MS;
    this.#filePath = join(directory, SESSION_FILE);
    this.#tmpPath = join(directory, `${SESSION_FILE}.tmp`);
  }

  /** Get session ID for a channel conversation. Returns undefined if not found or expired. */
  async get(key: SessionKey): Promise<string | undefined> {
    const store = await this.#readStore();
    const compositeKey = formatKey(key);
    const entry = store[compositeKey];
    if (!entry) {
      return undefined;
    }
    if (entry.lastAccessMs + this.#ttlMs < Date.now()) {
      return undefined;
    }
    return entry.sessionId;
  }

  /** Store or update a session ID for a channel conversation. Updates lastAccessMs. */
  async set(key: SessionKey, sessionId: string): Promise<void> {
    const store = await this.#readStore();
    const now = Date.now();

    // Evict all expired entries
    for (const k of Object.keys(store)) {
      if (store[k].lastAccessMs + this.#ttlMs < now) {
        delete store[k];
      }
    }

    store[formatKey(key)] = { sessionId, lastAccessMs: now };
    await this.#writeStore(store);
  }

  /** Delete a session entry. No-op if key doesn't exist. */
  async delete(key: SessionKey): Promise<void> {
    const store = await this.#readStore();
    const compositeKey = formatKey(key);
    if (!(compositeKey in store)) {
      return;
    }
    delete store[compositeKey];
    await this.#writeStore(store);
  }

  async #readStore(): Promise<Record<string, SessionEntry>> {
    try {
      const data = await readFile(this.#filePath, "utf-8");
      const parsed: unknown = JSON.parse(data);
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        return {};
      }
      return parsed as Record<string, SessionEntry>;
    } catch {
      return {};
    }
  }

  async #writeStore(store: Record<string, SessionEntry>): Promise<void> {
    await mkdir(this.#directory, { recursive: true });
    await writeFile(this.#tmpPath, JSON.stringify(store), "utf-8");
    await rename(this.#tmpPath, this.#filePath);
  }
}

/** Compose a flat string key from a SessionKey. */
function formatKey(key: SessionKey): string {
  return `${key.channelId}:${key.userId}:${key.threadId ?? "_"}`;
}
