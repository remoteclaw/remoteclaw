import fs from "node:fs";
import path from "node:path";
import { Logger as TsLogger } from "tslog";
import { getCommandPathWithRootOptions } from "../cli/argv.js";
import type { RemoteClawConfig } from "../config/types.js";
import {
  POSIX_REMOTECLAW_TMP_DIR,
  resolvePreferredRemoteClawTmpDir,
} from "../infra/tmp-remoteclaw-dir.js";
import { readLoggingConfig } from "./config.js";
import type { ConsoleStyle } from "./console.js";
import { resolveEnvLogLevelOverride } from "./env-log-level.js";
import { type LogLevel, levelToMinLevel, normalizeLogLevel } from "./levels.js";
import { resolveNodeRequireFromMeta } from "./node-require.js";
import { redactSensitiveText } from "./redact.js";
import { loggingState } from "./state.js";
import { formatTimestamp } from "./timestamps.js";

type ProcessWithBuiltinModule = NodeJS.Process & {
  getBuiltinModule?: (id: string) => unknown;
};

function canUseNodeFs(): boolean {
  const getBuiltinModule = (process as ProcessWithBuiltinModule).getBuiltinModule;
  if (typeof getBuiltinModule !== "function") {
    return false;
  }
  try {
    return getBuiltinModule("fs") !== undefined;
  } catch {
    return false;
  }
}

function resolveDefaultLogDir(): string {
  return canUseNodeFs() ? resolvePreferredRemoteClawTmpDir() : POSIX_REMOTECLAW_TMP_DIR;
}

export const DEFAULT_LOG_DIR = resolveDefaultLogDir();
export const DEFAULT_LOG_FILE = path.join(DEFAULT_LOG_DIR, "remoteclaw.log"); // legacy single-file path

const LOG_PREFIX = "remoteclaw";
const LOG_SUFFIX = ".log";
const MAX_LOG_AGE_MS = 24 * 60 * 60 * 1000; // 24h
const DEFAULT_MAX_LOG_FILE_BYTES = 500 * 1024 * 1024; // 500 MB

const requireConfig = resolveNodeRequireFromMeta(import.meta.url);

export type LoggerSettings = {
  level?: LogLevel;
  file?: string;
  maxFileBytes?: number;
  consoleLevel?: LogLevel;
  consoleStyle?: ConsoleStyle;
};

type LogObj = { date?: Date } & Record<string, unknown>;

type ResolvedSettings = {
  level: LogLevel;
  file: string;
  maxFileBytes: number;
};
export type LoggerResolvedSettings = ResolvedSettings;
export type LogTransportRecord = Record<string, unknown>;
export type LogTransport = (logObj: LogTransportRecord) => void;

const externalTransports = new Set<LogTransport>();

function shouldSkipLoadConfigFallback(argv: string[] = process.argv): boolean {
  const [primary, secondary] = getCommandPathWithRootOptions(argv, 2);
  return primary === "config" && secondary === "validate";
}

function attachExternalTransport(logger: TsLogger<LogObj>, transport: LogTransport): void {
  logger.attachTransport((logObj: LogObj) => {
    if (!externalTransports.has(transport)) {
      return;
    }
    try {
      transport(logObj as LogTransportRecord);
    } catch {
      // never block on logging failures
    }
  });
}

function canUseSilentVitestFileLogFastPath(envLevel: LogLevel | undefined): boolean {
  return (
    process.env.VITEST === "true" &&
    process.env.REMOTECLAW_TEST_FILE_LOG !== "1" &&
    !envLevel &&
    !loggingState.overrideSettings
  );
}

function resolveSettings(): ResolvedSettings {
  if (!canUseNodeFs()) {
    return {
      level: "silent",
      file: DEFAULT_LOG_FILE,
      maxFileBytes: DEFAULT_MAX_LOG_FILE_BYTES,
    };
  }

  const envLevel = resolveEnvLogLevelOverride();
  // Test runs default file logs to silent. Skip config reads and fallback load in the
  // common case to avoid pulling heavy config/schema stacks on startup.
  if (canUseSilentVitestFileLogFastPath(envLevel)) {
    return {
      level: "silent",
      file: defaultRollingPathForToday(),
      maxFileBytes: DEFAULT_MAX_LOG_FILE_BYTES,
    };
  }

  let cfg: RemoteClawConfig["logging"] | undefined =
    (loggingState.overrideSettings as LoggerSettings | null) ?? readLoggingConfig();
  if (!cfg && !shouldSkipLoadConfigFallback()) {
    try {
      const loaded = requireConfig?.("../config/config.js") as
        | {
            loadConfig?: () => RemoteClawConfig;
          }
        | undefined;
      cfg = loaded?.loadConfig?.().logging;
    } catch {
      cfg = undefined;
    }
  }
  const defaultLevel =
    process.env.VITEST === "true" && process.env.REMOTECLAW_TEST_FILE_LOG !== "1"
      ? "silent"
      : "info";
  const fromConfig = normalizeLogLevel(cfg?.level, defaultLevel);
  const level = envLevel ?? fromConfig;
  const file = cfg?.file ?? defaultRollingPathForToday();
  const maxFileBytes = resolveMaxLogFileBytes(cfg?.maxFileBytes);
  return { level, file, maxFileBytes };
}

function settingsChanged(a: ResolvedSettings | null, b: ResolvedSettings) {
  if (!a) {
    return true;
  }
  return a.level !== b.level || a.file !== b.file || a.maxFileBytes !== b.maxFileBytes;
}

export function isFileLogLevelEnabled(level: LogLevel): boolean {
  const settings = (loggingState.cachedSettings as ResolvedSettings | null) ?? resolveSettings();
  if (!loggingState.cachedSettings) {
    loggingState.cachedSettings = settings;
  }
  if (level === "silent") {
    return false;
  }
  if (settings.level === "silent") {
    return false;
  }
  return levelToMinLevel(level) >= levelToMinLevel(settings.level);
}

// Redact every string leaf of a caller-provided log argument in raw text, so a
// credential is masked in the same form the console sink sees it — before JSON
// serialization can wrap it in quotes or split it across structure. Objects and
// arrays recurse (a fresh copy is built; the input is never mutated, so sibling
// transports see the original); non-strings (numbers, booleans, Date) pass
// through. See the file transport in `buildLogger` for why redaction must run
// here, pre-serialization, rather than over the serialized JSON string.
//
// An own-enumerable `toJSON()` is intercepted (#2853): JSON.stringify would call
// it AFTER this pass and re-materialize whatever it returns unredacted, so the
// method is invoked here and its output redacted before serialization. A
// prototype / non-enumerable `toJSON` is not copied onto the rebuilt plain object
// (Object.entries below only copies own-enumerable props), so it never reaches
// the serializer — class instances stay safe and are left untouched. Recursion is
// bounded by a visited-set cycle break and a max-depth cap (#2853): a cyclic or
// deeply-nested graph yields a "[cyclic]" / "[maxDepth]" marker instead of
// overflowing the stack (the cap bounds recursion depth, not total node count) —
// which the transport's try/catch would otherwise turn into a silently dropped
// line.
const MAX_LOG_ARG_DEPTH = 32;

function redactLogArgLeaves(value: unknown): unknown {
  return redactLogArgLeaf(value, 0, new WeakSet<object>());
}

function redactLogArgLeaf(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (typeof value === "string") {
    return redactSensitiveText(value);
  }
  // Only arrays and plain (non-Date) objects recurse; everything else — numbers,
  // booleans, null, undefined, functions, Date — is a leaf and passes through.
  if (value === null || typeof value !== "object" || value instanceof Date) {
    return value;
  }
  // Depth/cycle guard, shared by both container kinds (see the header comment
  // for the stack-overflow / dropped-line rationale).
  if (depth >= MAX_LOG_ARG_DEPTH) {
    return "[maxDepth]";
  }
  if (seen.has(value)) {
    return "[cyclic]";
  }
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((entry) => redactLogArgLeaf(entry, depth + 1, seen));
    }
    // An own-enumerable `toJSON` survives the property copy below and is invoked
    // by JSON.stringify after redaction, re-materializing its (possibly
    // secret-bearing) return value raw. Intercept it: materialize now and redact
    // the result — or emit "[unserializable]" if it throws, rather than letting the
    // exception propagate out and drop the line. Scoped to own-enumerable (via
    // propertyIsEnumerable) because a prototype / non-enumerable `toJSON` is not
    // copied onto `out` and so never reaches the serializer — leaving it uninvoked
    // preserves existing behavior.
    const maybeToJSON = (value as { toJSON?: unknown }).toJSON;
    if (
      typeof maybeToJSON === "function" &&
      Object.prototype.propertyIsEnumerable.call(value, "toJSON")
    ) {
      let materialized: unknown;
      try {
        materialized = (maybeToJSON as () => unknown).call(value);
      } catch {
        return "[unserializable]";
      }
      return redactLogArgLeaf(materialized, depth + 1, seen);
    }
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      out[key] = redactLogArgLeaf(nested, depth + 1, seen);
    }
    return out;
  } finally {
    // Backtrack so a shared (non-cyclic) reference in a sibling position is not
    // mistaken for a cycle — only an ancestor still on the stack counts.
    seen.delete(value);
  }
}

// tslog's `_meta` is framework-generated — runtime info, timestamp, source path,
// log level — and carries no caller secrets, WITH two exceptions: `name` and
// `parentNames` echo the label/bindings passed to getChildLogger(), which are
// caller-controlled (a plugin could bind request-scoped context that embeds a
// credential). Redact just those two fields and pass the rest of `_meta` through
// untouched, so the hot path skips recursing the (secret-free) source-path graph.
function redactLogMeta(meta: unknown): unknown {
  if (meta === null || typeof meta !== "object") {
    return meta;
  }
  const source = meta as Record<string, unknown>;
  const out: Record<string, unknown> = { ...source };
  if (typeof source.name === "string") {
    out.name = redactSensitiveText(source.name);
  }
  if (Array.isArray(source.parentNames)) {
    out.parentNames = source.parentNames.map((entry) =>
      typeof entry === "string" ? redactSensitiveText(entry) : entry,
    );
  }
  return out;
}

function buildLogger(settings: ResolvedSettings): TsLogger<LogObj> {
  const logger = new TsLogger<LogObj>({
    name: "remoteclaw",
    minLevel: levelToMinLevel(settings.level),
    type: "hidden", // no ansi formatting
  });

  // Silent logging does not write files; skip all filesystem setup in this path.
  if (settings.level === "silent") {
    for (const transport of externalTransports) {
      attachExternalTransport(logger, transport);
    }
    return logger;
  }

  fs.mkdirSync(path.dirname(settings.file), { recursive: true });
  // Clean up stale rolling logs when using a dated log filename.
  if (isRollingPath(settings.file)) {
    pruneOldRollingLogs(path.dirname(settings.file));
  }
  let currentFileBytes = getCurrentLogFileBytes(settings.file);
  let warnedAboutSizeCap = false;

  logger.attachTransport((logObj: LogObj) => {
    try {
      const time = formatTimestamp(logObj.date ?? new Date(), { style: "long" });
      // Redact at write ("redact-at-source"). This file sink is served to remote
      // operator clients via the gateway `logs.tail` method and the CLI `logs`
      // command, neither of which redacts on read; the console sinks redact
      // separately. This transport is the sole writer and the single choke point
      // for every file feeder — subsystem file logging, the patched console.*
      // capture, and direct getLogger()/getChildLogger() callers — so it scrubs
      // the record here, which also hardens the on-disk file against direct
      // filesystem access.
      //
      // Redaction runs over each string LEAF of the caller-provided arguments,
      // in raw text, BEFORE serialization — never over the serialized JSON.
      // Regex-redacting serialized JSON is unsafe: a raw-text value class such as
      // `token=[^\s&#]+` runs past a value's closing quote and eats adjacent
      // structure (corrupting the line), and a credential beginning a value sits
      // after a `"` the redactor treats as a non-word boundary (and leaks).
      // Redacting raw leaves — where a value ends at the string's own boundary —
      // avoids both and keeps the record valid JSON once re-serialized. tslog's
      // own `_meta` is mostly framework-generated (runtime info, source path);
      // its two caller-derived fields (child-logger name/parentNames) are redacted
      // by `redactLogMeta` while the rest is passed through to keep this hot path
      // cheap.
      const record: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(logObj)) {
        record[key] = key === "_meta" ? redactLogMeta(value) : redactLogArgLeaves(value);
      }
      record.time = time;
      const line = JSON.stringify(record);
      const payload = `${line}\n`;
      const payloadBytes = Buffer.byteLength(payload, "utf8");
      const nextBytes = currentFileBytes + payloadBytes;
      if (nextBytes > settings.maxFileBytes) {
        if (!warnedAboutSizeCap) {
          warnedAboutSizeCap = true;
          const warningLine = JSON.stringify({
            time: formatTimestamp(new Date(), { style: "long" }),
            level: "warn",
            subsystem: "logging",
            message: `log file size cap reached; suppressing writes file=${settings.file} maxFileBytes=${settings.maxFileBytes}`,
          });
          appendLogLine(settings.file, `${warningLine}\n`);
          process.stderr.write(
            `[remoteclaw] log file size cap reached; suppressing writes file=${settings.file} maxFileBytes=${settings.maxFileBytes}\n`,
          );
        }
        return;
      }
      if (appendLogLine(settings.file, payload)) {
        currentFileBytes = nextBytes;
      }
    } catch {
      // never block on logging failures
    }
  });
  for (const transport of externalTransports) {
    attachExternalTransport(logger, transport);
  }

  return logger;
}

function resolveMaxLogFileBytes(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return Math.floor(raw);
  }
  return DEFAULT_MAX_LOG_FILE_BYTES;
}

function getCurrentLogFileBytes(file: string): number {
  try {
    return fs.statSync(file).size;
  } catch {
    return 0;
  }
}

function appendLogLine(file: string, line: string): boolean {
  try {
    fs.appendFileSync(file, line, { encoding: "utf8" });
    return true;
  } catch {
    return false;
  }
}

export function getLogger(): TsLogger<LogObj> {
  const settings = resolveSettings();
  const cachedLogger = loggingState.cachedLogger as TsLogger<LogObj> | null;
  const cachedSettings = loggingState.cachedSettings as ResolvedSettings | null;
  if (!cachedLogger || settingsChanged(cachedSettings, settings)) {
    loggingState.cachedLogger = buildLogger(settings);
    loggingState.cachedSettings = settings;
  }
  return loggingState.cachedLogger as TsLogger<LogObj>;
}

export function getChildLogger(
  bindings?: Record<string, unknown>,
  opts?: { level?: LogLevel },
): TsLogger<LogObj> {
  const base = getLogger();
  const minLevel = opts?.level ? levelToMinLevel(opts.level) : base.settings.minLevel;
  const name = bindings ? JSON.stringify(bindings) : undefined;
  return base.getSubLogger({
    name,
    minLevel,
    prefix: bindings ? [name ?? ""] : [],
  });
}

// Baileys expects a pino-like logger shape. Provide a lightweight adapter.
export function toPinoLikeLogger(logger: TsLogger<LogObj>, level: LogLevel): PinoLikeLogger {
  const buildChild = (bindings?: Record<string, unknown>) =>
    toPinoLikeLogger(
      logger.getSubLogger({
        name: bindings ? JSON.stringify(bindings) : undefined,
        minLevel: logger.settings.minLevel,
      }),
      level,
    );

  return {
    level,
    child: buildChild,
    trace: (...args: unknown[]) => logger.trace(...args),
    debug: (...args: unknown[]) => logger.debug(...args),
    info: (...args: unknown[]) => logger.info(...args),
    warn: (...args: unknown[]) => logger.warn(...args),
    error: (...args: unknown[]) => logger.error(...args),
    fatal: (...args: unknown[]) => logger.fatal(...args),
  };
}

export type PinoLikeLogger = {
  level: string;
  child: (bindings?: Record<string, unknown>) => PinoLikeLogger;
  trace: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  fatal: (...args: unknown[]) => void;
};

export function getResolvedLoggerSettings(): LoggerResolvedSettings {
  return resolveSettings();
}

// Test helpers
export function setLoggerOverride(settings: LoggerSettings | null) {
  loggingState.overrideSettings = settings;
  loggingState.cachedLogger = null;
  loggingState.cachedSettings = null;
  loggingState.cachedConsoleSettings = null;
}

export function resetLogger() {
  loggingState.cachedLogger = null;
  loggingState.cachedSettings = null;
  loggingState.cachedConsoleSettings = null;
  loggingState.overrideSettings = null;
}

export function registerLogTransport(transport: LogTransport): () => void {
  externalTransports.add(transport);
  const logger = loggingState.cachedLogger as TsLogger<LogObj> | null;
  if (logger) {
    attachExternalTransport(logger, transport);
  }
  return () => {
    externalTransports.delete(transport);
  };
}

export const __test__ = {
  shouldSkipLoadConfigFallback,
  redactLogArgLeaves,
};

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function defaultRollingPathForToday(): string {
  const today = formatLocalDate(new Date());
  return path.join(DEFAULT_LOG_DIR, `${LOG_PREFIX}-${today}${LOG_SUFFIX}`);
}

function isRollingPath(file: string): boolean {
  const base = path.basename(file);
  return (
    base.startsWith(`${LOG_PREFIX}-`) &&
    base.endsWith(LOG_SUFFIX) &&
    base.length === `${LOG_PREFIX}-YYYY-MM-DD${LOG_SUFFIX}`.length
  );
}

function pruneOldRollingLogs(dir: string): void {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const cutoff = Date.now() - MAX_LOG_AGE_MS;
    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }
      if (!entry.name.startsWith(`${LOG_PREFIX}-`) || !entry.name.endsWith(LOG_SUFFIX)) {
        continue;
      }
      const fullPath = path.join(dir, entry.name);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.mtimeMs < cutoff) {
          fs.rmSync(fullPath, { force: true });
        }
      } catch {
        // ignore errors during pruning
      }
    }
  } catch {
    // ignore missing dir or read errors
  }
}
