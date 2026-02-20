/**
 * Pure import logic for migrating an OpenClaw config into RemoteClaw format.
 *
 * No I/O — all file reads/writes live in the CLI command handler.
 * Designed for reuse by the setup wizard.
 */

/** Sections explicitly dropped during import with user-facing reasons. */
const DROPPED_SECTIONS: Readonly<Record<string, string>> = {
  skills: "Not supported; RemoteClaw loads skills from your ~/.claude/ directory",
  models: "Not supported; CLI backends manage their own models and auth",
  plugins: "Not compatible; RemoteClaw uses a different plugin SDK",
  wizard: "Session-specific; not meaningful after migration",
  update: "RemoteClaw manages its own update channel",
};

/** Internal metadata keys — never imported (set fresh on write). */
const EXCLUDED_METADATA_KEYS: ReadonlySet<string> = new Set(["$schema", "meta"]);

/**
 * All valid top-level keys in RemoteClawConfig that should be imported when
 * present in the source. Derived from the Zod schema.
 */
const IMPORTABLE_SECTIONS: ReadonlySet<string> = new Set([
  "auth",
  "env",
  "diagnostics",
  "logging",
  "browser",
  "ui",
  "nodeHost",
  "agents",
  "tools",
  "bindings",
  "broadcast",
  "audio",
  "media",
  "messages",
  "commands",
  "approvals",
  "session",
  "web",
  "channels",
  "cron",
  "hooks",
  "discovery",
  "canvasHost",
  "talk",
  "gateway",
  "memory",
]);

export type ImportMode = "error" | "overwrite" | "merge";

export type ImportedSection = {
  key: string;
  summary: string;
};

export type DroppedSection = {
  key: string;
  reason: string;
};

export type ImportResult = {
  /** The resulting config object (plain object, not yet validated). */
  config: Record<string, unknown>;
  /** Sections successfully imported from the source. */
  imported: ImportedSection[];
  /** Sections dropped (known-dropped or unknown). */
  dropped: DroppedSection[];
  /** Session migration note to display to the user. */
  sessionNote: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Deep-merge two plain objects. Values from `over` take precedence.
 * Arrays are replaced wholesale (not concatenated).
 */
function deepMerge(
  base: Record<string, unknown>,
  over: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const [key, overValue] of Object.entries(over)) {
    const baseValue = result[key];
    if (isPlainObject(baseValue) && isPlainObject(overValue)) {
      result[key] = deepMerge(baseValue, overValue);
    } else {
      result[key] = overValue;
    }
  }
  return result;
}

/** Build a human-readable one-line summary for an imported section. */
function summarizeSection(key: string, value: unknown): string {
  if (value == null) {
    return "empty";
  }
  if (!isPlainObject(value)) {
    return typeof value === "string" ? value : JSON.stringify(value);
  }

  const obj = value;

  switch (key) {
    case "channels": {
      const channelKeys = Object.keys(obj).filter((k) => isPlainObject(obj[k]));
      if (channelKeys.length === 0) {
        return "no adapters";
      }
      return `${channelKeys.length} adapter${channelKeys.length === 1 ? "" : "s"} (${channelKeys.join(", ")})`;
    }
    case "agents": {
      const list = obj.list;
      const count = Array.isArray(list) ? list.length : 0;
      return `${count} agent${count === 1 ? "" : "s"}`;
    }
    case "gateway": {
      const parts: string[] = [];
      if (typeof obj.port === "number") {
        parts.push(`port ${obj.port}`);
      }
      const auth = obj.auth;
      if (isPlainObject(auth)) {
        if (auth.token) {
          parts.push("token ******");
        }
        if (auth.password) {
          parts.push("password ******");
        }
      }
      return parts.length > 0 ? parts.join(", ") : `${Object.keys(obj).length} keys`;
    }
    case "hooks": {
      const mappings = obj.mappings;
      const count = Array.isArray(mappings) ? mappings.length : 0;
      if (count > 0) {
        return `${count} hook${count === 1 ? "" : "s"}`;
      }
      return `${Object.keys(obj).length} keys`;
    }
    case "cron": {
      const keys = Object.keys(obj).filter((k) => k !== "enabled" && k !== "store");
      return keys.length > 0 ? `${keys.length} setting${keys.length === 1 ? "" : "s"}` : "enabled";
    }
    default: {
      const keys = Object.keys(obj);
      return `${keys.length} key${keys.length === 1 ? "" : "s"}`;
    }
  }
}

const SESSION_NOTE =
  "Sessions not migrated: RemoteClaw session IDs are not compatible with OpenClaw.\nStart fresh conversations; your channel history (Telegram, Slack, etc.) is unaffected.";

/**
 * Import an OpenClaw config into RemoteClaw format.
 *
 * @param source  - Parsed source config (the openclaw.json content).
 * @param existing - Parsed existing RemoteClaw config, or null if none.
 * @param mode    - Import strategy:
 *                  `"error"` / `"overwrite"`: use imported config only.
 *                  `"merge"`: deep-merge imported into existing; existing values win on conflict.
 */
export function importConfig(
  source: Record<string, unknown>,
  existing: Record<string, unknown> | null,
  mode: ImportMode,
): ImportResult {
  const imported: ImportedSection[] = [];
  const dropped: DroppedSection[] = [];
  const config: Record<string, unknown> = {};

  for (const key of Object.keys(source)) {
    const value = source[key];

    if (EXCLUDED_METADATA_KEYS.has(key)) {
      continue;
    }

    if (key in DROPPED_SECTIONS) {
      dropped.push({ key, reason: DROPPED_SECTIONS[key] });
      continue;
    }

    if (IMPORTABLE_SECTIONS.has(key)) {
      config[key] = structuredClone(value);
      imported.push({ key, summary: summarizeSection(key, value) });
      continue;
    }

    dropped.push({ key, reason: "Unknown section; not supported by RemoteClaw" });
  }

  if (mode === "merge" && existing != null) {
    // Existing values win on conflict: merge imported (base) with existing (over).
    const existingClean: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(existing)) {
      if (!EXCLUDED_METADATA_KEYS.has(key)) {
        existingClean[key] = value;
      }
    }
    return {
      config: deepMerge(config, existingClean),
      imported,
      dropped,
      sessionNote: SESSION_NOTE,
    };
  }

  return {
    config,
    imported,
    dropped,
    sessionNote: SESSION_NOTE,
  };
}
