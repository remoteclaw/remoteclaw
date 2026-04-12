/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from "node:fs";

// Gutted in RemoteClaw fork (Middleware Boundary Principle)
export function isLegacyWhatsAppAuthFile(..._args: unknown[]): boolean {
  return false;
}

export type SessionEntryLike = any;

/**
 * Read a persisted session store as plain JSON.
 *
 * RemoteClaw writes session stores as plain JSON via `JSON.stringify` (see
 * `src/config/sessions/store.ts`), so a JSON5 parser is not required to read
 * them back. Kept under the historical `readSessionStoreJson5` name so the
 * upstream migration framework in `state-migrations.ts` can continue to call
 * it through the existing `{ store, ok }` contract.
 *
 * Returns `{ store: {}, ok: false }` when the file is missing, unreadable, or
 * does not contain a top-level object so callers can distinguish "no store"
 * from "empty store".
 */
export function readSessionStoreJson5(storePath: string): {
  store: Record<string, SessionEntryLike>;
  ok: boolean;
} {
  let raw: string;
  try {
    raw = fs.readFileSync(storePath, "utf8");
  } catch {
    return { store: {}, ok: false };
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { store: parsed as Record<string, SessionEntryLike>, ok: true };
    }
    return { store: {}, ok: false };
  } catch {
    return { store: {}, ok: false };
  }
}
export function safeReadDir(..._args: unknown[]): any[] {
  return [];
}
export function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}
export function existsDir(dirPath: string): boolean {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}
export function fileExists(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}
