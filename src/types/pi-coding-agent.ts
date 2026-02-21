/**
 * Type definitions extracted from @mariozechner/pi-coding-agent.
 *
 * These replace `import type` from that package so the runtime dependency can
 * be removed while keeping the type contracts intact.
 *
 * `any` in the originals is replaced with `unknown` to satisfy oxlint
 * `no-explicit-any`.
 */

import type { ImageContent, Model, TextContent } from "./pi-ai.js";

// ── ExtensionContext ──────────────────────────────────────────────────────────

/**
 * Context passed to extension event handlers.
 *
 * Only the subset of properties actually used by our codebase is defined.
 * The full upstream type has many more fields (ui, sessionManager, etc.).
 */
export interface ExtensionContext {
  /** Current model (may be undefined). */
  model: Model | undefined;
  [key: string]: unknown;
}

// ── Session types ─────────────────────────────────────────────────────────────

/**
 * Session header metadata written as the first line of a session JSONL file.
 */
export interface SessionHeader {
  type: "session";
  version?: number;
  id: string;
  timestamp: string;
  cwd: string;
  parentSession?: string;
}

interface SessionEntryBase {
  type: string;
  id: string;
  parentId: string | null;
  timestamp: string;
}

export interface SessionMessageEntry extends SessionEntryBase {
  type: "message";
  message: unknown;
}

export interface ThinkingLevelChangeEntry extends SessionEntryBase {
  type: "thinking_level_change";
  thinkingLevel: string;
}

export interface ModelChangeEntry extends SessionEntryBase {
  type: "model_change";
  provider: string;
  modelId: string;
}

export interface CompactionEntry<T = unknown> extends SessionEntryBase {
  type: "compaction";
  summary: string;
  firstKeptEntryId: string;
  tokensBefore: number;
  details?: T;
  fromHook?: boolean;
}

export interface BranchSummaryEntry<T = unknown> extends SessionEntryBase {
  type: "branch_summary";
  fromId: string;
  summary: string;
  details?: T;
  fromHook?: boolean;
}

export interface CustomEntry<T = unknown> extends SessionEntryBase {
  type: "custom";
  customType: string;
  data?: T;
}

export interface CustomMessageEntry<T = unknown> extends SessionEntryBase {
  type: "custom_message";
  customType: string;
  content: string | (TextContent | ImageContent)[];
  details?: T;
  display: boolean;
}

export interface LabelEntry extends SessionEntryBase {
  type: "label";
  targetId: string;
  label: string | undefined;
}

export interface SessionInfoEntry extends SessionEntryBase {
  type: "session_info";
  name?: string;
}

/**
 * Union of all session entry types (excludes the header).
 */
export type SessionEntry =
  | SessionMessageEntry
  | ThinkingLevelChangeEntry
  | ModelChangeEntry
  | CompactionEntry
  | BranchSummaryEntry
  | CustomEntry
  | CustomMessageEntry
  | LabelEntry
  | SessionInfoEntry;

// ── Skill ─────────────────────────────────────────────────────────────────────

export interface Skill {
  name: string;
  description: string;
  filePath: string;
  baseDir: string;
  source: string;
  disableModelInvocation: boolean;
}

// ── SessionManager ────────────────────────────────────────────────────────────

/**
 * Minimal SessionManager class shape for type-only usage.
 *
 * Files that import the value (class constructor, static methods) still import
 * directly from `@mariozechner/pi-coding-agent`. This declaration covers only
 * the instance interface used by `import type` consumers.
 */
export declare class SessionManager {
  appendMessage(message: unknown): string;
  getSessionFile(): string | undefined;
  getEntries(): SessionEntry[];
  getHeader(): SessionHeader | null;
  getLeafId(): string | null;
  getBranch(fromId?: string): SessionEntry[];
  getSessionId(): string;
  getCwd(): string;
  getSessionDir(): string;
  getEntry(id: string): SessionEntry | undefined;
  getLabel(id: string): string | undefined;
  getLeafEntry(): SessionEntry | undefined;
  getSessionName(): string | undefined;
  appendThinkingLevelChange(thinkingLevel: string): string;
  appendModelChange(provider: string, modelId: string): string;
  appendCompaction<T = unknown>(
    summary: string,
    firstKeptEntryId: string,
    tokensBefore: number,
    details?: T,
    fromHook?: boolean,
  ): string;
  appendCustomEntry(customType: string, data?: unknown): string;
  appendSessionInfo(name: string): string;
  appendCustomMessageEntry<T = unknown>(
    customType: string,
    content: string | (TextContent | ImageContent)[],
    display: boolean,
    details?: T,
  ): string;
  branch(branchFromId: string): void;
  resetLeaf(): void;
  branchWithSummary(
    branchFromId: string | null,
    summary: string,
    details?: unknown,
    fromHook?: boolean,
  ): string;
}

// ── ExtensionAPI ──────────────────────────────────────────────────────────────

/**
 * API surface passed to extension factory functions.
 *
 * Defined as a minimal structural interface covering the methods actually
 * used by our `.pi/extensions/` code: `registerCommand`, `exec`, and
 * the `on()` event subscription overloads. Full upstream type has many more
 * overloads and methods.
 */
export interface ExtensionAPI {
  /** Register a custom command. */
  registerCommand(
    name: string,
    options: {
      description?: string;
      handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
    },
  ): void;

  /** Execute a shell command. */
  exec(
    command: string,
    args: string[],
    options?: { cwd?: string; [key: string]: unknown },
  ): Promise<ExecResult>;

  /** Subscribe to extension events. */
  on(event: string, handler: (...args: unknown[]) => unknown): void;

  [key: string]: unknown;
}

/**
 * Result of executing a shell command via `pi.exec()`.
 */
export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * Extended context for command handlers.
 */
export interface ExtensionCommandContext extends ExtensionContext {
  /** Whether UI is available */
  hasUI: boolean;
  /** Current working directory */
  cwd: string;
  /** Session manager (read-only subset) */
  sessionManager: Pick<
    SessionManager,
    | "getCwd"
    | "getSessionDir"
    | "getSessionId"
    | "getSessionFile"
    | "getLeafId"
    | "getLeafEntry"
    | "getEntry"
    | "getLabel"
    | "getBranch"
    | "getHeader"
    | "getEntries"
    | "getSessionName"
  >;
  /** UI interaction methods. */
  ui: ExtensionUIContext;
  [key: string]: unknown;
}

/**
 * Minimal UI context for extensions. Only the methods used by our extensions
 * are declared; the full upstream type is much larger.
 */
export interface ExtensionUIContext {
  notify(message: string, type?: "info" | "warning" | "error"): void;
  custom<T>(
    factory: (
      tui: unknown,
      theme: unknown,
      keybindings: unknown,
      done: (result: T) => void,
    ) =>
      | { render: unknown; invalidate: unknown; handleInput: unknown }
      | Promise<{ render: unknown; invalidate: unknown; handleInput: unknown }>,
    options?: unknown,
  ): Promise<T>;
  [key: string]: unknown;
}
