import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { resolveNewStateDir } from "../config/paths.js";
import { RemoteClawSchema } from "../config/zod-schema.js";
import type { RuntimeEnv } from "../runtime.js";
import { defaultRuntime } from "../runtime.js";
import { shortenHomePath } from "../utils.js";
import { VERSION } from "../version.js";
import { createClackPrompter } from "../wizard/clack-prompter.js";

/**
 * Config key prefixes that need rewriting during import.
 * The import rewrites env var references from the OpenClaw namespace
 * to the RemoteClaw namespace.
 */
const ENV_VAR_PREFIX_OLD = "OPENCLAW_";
const ENV_VAR_PREFIX_NEW = "REMOTECLAW_";

/**
 * OpenClaw config filename that gets renamed during import.
 */
const OPENCLAW_CONFIG_FILENAME = "openclaw.json";
const REMOTECLAW_CONFIG_FILENAME = "remoteclaw.json";

/**
 * Default agent id used by OpenClaw when no explicit id is set.
 */
const DEFAULT_AGENT_ID = "main";

/**
 * Default workspace path for the default agent.
 */
const DEFAULT_WORKSPACE = "~/.remoteclaw/workspace";

/**
 * Keys whose presence indicates the config has substantive content
 * (i.e. it's a real config, not an empty/skeleton file).
 */
const SUBSTANTIVE_CONFIG_KEYS = new Set([
  "channels",
  "plugins",
  "gateway",
  "bindings",
  "broadcast",
  "cron",
  "hooks",
  "discovery",
]);

/**
 * Auth profile filenames used for discovery during import.
 */
const AUTH_PROFILES_FILENAME = "auth-profiles.json";
const LEGACY_AUTH_FILENAME = "auth.json";

/**
 * Runtime-to-provider mapping for auto-detecting auth profiles.
 * Profile IDs use `{provider}:{name}` format; the provider prefix is matched
 * against these lists.
 */
const RUNTIME_AUTH_PROVIDERS: Record<string, string[]> = {
  claude: ["anthropic", "claude"],
  gemini: ["google"],
  codex: ["codex", "openai", "openai-codex"],
  opencode: ["openai", "anthropic", "opencode"],
};

export type ImportOptions = {
  sourcePath: string;
  yes?: boolean;
  dryRun?: boolean;
  nonInteractive?: boolean;
};

export type ImportResult = {
  copiedFiles: string[];
  transformedFiles: string[];
  envVarRenames: string[];
  skippedEntries: string[];
  targetDir: string;
  consolidatedAuthProfiles: string[];
  authProfileConflicts: string[];
};

/**
 * Transform config content by replacing OPENCLAW_* env var references
 * with REMOTECLAW_* equivalents.
 *
 * Handles both `${OPENCLAW_*}` template references and bare `OPENCLAW_*` string values.
 */
export function transformConfigContent(content: string): {
  content: string;
  renames: string[];
} {
  const renames: string[] = [];

  // Replace ${OPENCLAW_*} env var template references
  const templatePattern = /\$\{(OPENCLAW_\w+)\}/g;
  let transformed = content.replace(templatePattern, (_match, varName: string) => {
    const newVarName = varName.replace(ENV_VAR_PREFIX_OLD, ENV_VAR_PREFIX_NEW);
    renames.push(`\${${varName}} -> \${${newVarName}}`);
    return `\${${newVarName}}`;
  });

  // Replace bare "OPENCLAW_*" string values (in JSON string values)
  // This catches cases like: "envVar": "OPENCLAW_GATEWAY_TOKEN"
  const barePattern = /("(?:[^"\\]|\\.)*")/g;
  transformed = transformed.replace(barePattern, (match) => {
    if (match.includes(ENV_VAR_PREFIX_OLD)) {
      const updated = match.replace(
        new RegExp(`${ENV_VAR_PREFIX_OLD}(\\w+)`, "g"),
        (_m, suffix: string) => {
          const oldName = `${ENV_VAR_PREFIX_OLD}${suffix}`;
          const newName = `${ENV_VAR_PREFIX_NEW}${suffix}`;
          renames.push(`${oldName} -> ${newName}`);
          return newName;
        },
      );
      return updated;
    }
    return match;
  });

  // Replace path references from .openclaw to .remoteclaw in string values
  const pathPattern = /("(?:[^"\\]|\\.)*")/g;
  transformed = transformed.replace(pathPattern, (match) => {
    if (match.includes("/.openclaw/") || match.includes("\\.openclaw\\")) {
      return match
        .replace(/\/\.openclaw\//g, "/.remoteclaw/")
        .replace(/\\\.openclaw\\/g, "\\.remoteclaw\\");
    }
    return match;
  });

  return { content: transformed, renames: [...new Set(renames)] };
}

/**
 * Recursive key-tree node describing an object schema's known keys.
 *
 * - `children`: declared shape keys → their sub-trees (`null` = leaf)
 * - `catchall`: when `true`, undeclared keys are preserved as-is
 *   (the schema uses `.catchall()` to accept arbitrary extra keys)
 */
type KeyTreeNode = {
  children: Map<string, KeyTreeNode | null>;
  catchall: boolean;
};

/**
 * Build a recursive key-tree from a Zod schema by walking `.shape` properties.
 * Unwraps optional/nullable/default wrappers via `.unwrap()` to reach the
 * underlying object shape. Returns `null` for non-object schemas (leaves).
 */
function buildKeyTree(schema: unknown): KeyTreeNode | null {
  // Unwrap optional / nullable / default wrappers (.unwrap())
  let current = schema;
  while (
    current &&
    typeof current === "object" &&
    "unwrap" in current &&
    typeof current.unwrap === "function"
  ) {
    current = current.unwrap();
  }

  // Check for object shape
  if (
    !current ||
    typeof current !== "object" ||
    !("shape" in current) ||
    !current.shape ||
    typeof current.shape !== "object"
  ) {
    return null;
  }

  // Detect .catchall() — schema allows arbitrary extra keys.
  // In Zod v4, .strict() sets catchall to ZodNever (type "never"),
  // while a real .catchall() sets it to the accepting type.
  const def =
    "_zod" in current &&
    current._zod &&
    typeof current._zod === "object" &&
    "def" in current._zod &&
    current._zod.def &&
    typeof current._zod.def === "object"
      ? (current._zod.def as Record<string, unknown>)
      : null;
  const catchallSchema = def !== null && "catchall" in def ? def.catchall : null;
  const hasCatchall = Boolean(
    catchallSchema != null &&
    typeof catchallSchema === "object" &&
    "_zod" in catchallSchema &&
    catchallSchema._zod &&
    typeof catchallSchema._zod === "object" &&
    "def" in catchallSchema._zod &&
    catchallSchema._zod.def &&
    typeof catchallSchema._zod.def === "object" &&
    "type" in catchallSchema._zod.def &&
    catchallSchema._zod.def.type !== "never",
  );

  const shape = current.shape as Record<string, unknown>;
  const children = new Map<string, KeyTreeNode | null>();

  for (const [key, fieldSchema] of Object.entries(shape)) {
    children.set(key, buildKeyTree(fieldSchema));
  }

  return { children, catchall: hasCatchall };
}

/** Pre-built key tree from the root config schema, computed once at module load. */
const CONFIG_KEY_TREE = buildKeyTree(RemoteClawSchema)!;

/**
 * Recursively filter an object to only keep keys present in the key tree.
 * Keys in catchall objects are always preserved.
 */
function filterByKeyTree(
  obj: Record<string, unknown>,
  node: KeyTreeNode,
): { result: Record<string, unknown>; changed: boolean } {
  let changed = false;
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (!node.children.has(key)) {
      if (node.catchall) {
        // Schema accepts arbitrary extra keys — preserve as-is
        result[key] = value;
      } else {
        changed = true;
      }
      continue;
    }

    const childNode = node.children.get(key);
    if (childNode && value !== null && typeof value === "object" && !Array.isArray(value)) {
      const nested = filterByKeyTree(value as Record<string, unknown>, childNode);
      result[key] = nested.result;
      if (nested.changed) {
        changed = true;
      }
    } else {
      result[key] = value;
    }
  }

  return { result, changed };
}

/**
 * Strip unrecognized keys from the entire config JSON by filtering against
 * the current RemoteClawSchema shape tree.
 *
 * OpenClaw configs may contain keys that RemoteClaw's schema no longer accepts.
 * Instead of maintaining a denylist of dead keys, this function keeps only keys
 * the current schema recognizes — any key we don't know about is dropped.
 * Recurses into nested strict objects so sub-keys are filtered too.
 */
export function stripUnrecognizedConfigKeys(jsonContent: string): string {
  let config: Record<string, unknown>;
  try {
    config = JSON.parse(jsonContent);
  } catch {
    return jsonContent;
  }

  if (typeof config !== "object" || config === null || Array.isArray(config)) {
    return jsonContent;
  }

  const { result, changed } = filterByKeyTree(config, CONFIG_KEY_TREE);
  if (!changed) {
    return jsonContent;
  }

  const indentMatch = jsonContent.match(/^(\s+)"/m);
  const indent = indentMatch?.[1] ?? "  ";
  return JSON.stringify(result, null, indent) + "\n";
}

/**
 * Remove the `wizard` section from imported config.
 *
 * OpenClaw configs carry wizard state (`wizard.lastRunVersion`,
 * `wizard.lastRunCommand`, etc.) that reflects OpenClaw's wizard history.
 * This is misleading after import — RemoteClaw's wizard has never run.
 * Clearing the section ensures the user gets a fresh wizard experience.
 */
export function clearWizardSection(jsonContent: string): string {
  let config: Record<string, unknown>;
  try {
    config = JSON.parse(jsonContent);
  } catch {
    return jsonContent;
  }

  if (typeof config !== "object" || config === null || Array.isArray(config)) {
    return jsonContent;
  }

  if (!("wizard" in config)) {
    return jsonContent;
  }

  delete config.wizard;

  const indentMatch = jsonContent.match(/^(\s+)"/m);
  const indent = indentMatch?.[1] ?? "  ";
  return JSON.stringify(config, null, indent) + "\n";
}

/**
 * Strip the `$schema` field from config JSON.
 *
 * OpenClaw configs may contain `"$schema": "https://openclaw.org/..."` pointing
 * to an OpenClaw schema URL. Rather than rewriting to a RemoteClaw URL (which
 * may have a different format), we strip the field entirely — RemoteClaw will
 * write its own `$schema` on the next config save if needed.
 */
export function stripSchemaField(jsonContent: string): string {
  let config: Record<string, unknown>;
  try {
    config = JSON.parse(jsonContent);
  } catch {
    return jsonContent;
  }

  if (typeof config !== "object" || config === null || Array.isArray(config)) {
    return jsonContent;
  }

  if (!("$schema" in config)) {
    return jsonContent;
  }

  delete config.$schema;

  const indentMatch = jsonContent.match(/^(\s+)"/m);
  const indent = indentMatch?.[1] ?? "  ";
  return JSON.stringify(config, null, indent) + "\n";
}

/**
 * Materialize implicit OpenClaw workspace defaults into the main config JSON.
 *
 * OpenClaw had a three-tier workspace resolution chain that was removed in
 * #278 and #298. After import, configs that relied on those implicit defaults
 * fail validation. This function makes those defaults explicit:
 *
 * 1. For each agent in agents.list[] without workspace:
 *    - Use agents.defaults.workspace if set
 *    - Else default agent → ~/.remoteclaw/workspace
 *    - Else non-default → ~/.remoteclaw/workspace-{id}
 * 2. If agents.list is empty/missing but config has substantive content,
 *    create a default agent entry.
 * 3. Remove agents.defaults.workspace after consuming it.
 */
export function materializeWorkspaceDefaults(jsonContent: string): string {
  let config: Record<string, unknown>;
  try {
    config = JSON.parse(jsonContent);
  } catch {
    // Not valid JSON — return as-is (don't break non-JSON configs)
    return jsonContent;
  }

  if (typeof config !== "object" || config === null || Array.isArray(config)) {
    return jsonContent;
  }

  const agents = config.agents as Record<string, unknown> | undefined;
  const agentsList = (agents?.list ?? []) as Record<string, unknown>[];
  const defaultsWorkspace =
    typeof (agents?.defaults as Record<string, unknown> | undefined)?.workspace === "string"
      ? ((agents!.defaults as Record<string, unknown>).workspace as string)
      : undefined;

  const hasSubstantiveContent = Object.keys(config).some((key) => SUBSTANTIVE_CONFIG_KEYS.has(key));

  let mutated = false;

  if (agentsList.length === 0 && hasSubstantiveContent) {
    // Step 2: Create default agent entry when config has real content
    const newAgents = agents ?? {};
    newAgents.list = [{ id: DEFAULT_AGENT_ID, workspace: DEFAULT_WORKSPACE }];
    config.agents = newAgents;
    mutated = true;
  } else {
    // Step 1: Materialize workspace on existing agents
    for (const entry of agentsList) {
      if (typeof entry.workspace === "string" && entry.workspace.trim()) {
        continue;
      }
      if (defaultsWorkspace) {
        entry.workspace = defaultsWorkspace;
      } else {
        const id = typeof entry.id === "string" ? entry.id.trim() : "";
        const isDefault =
          entry.default === true || id === DEFAULT_AGENT_ID || agentsList.length === 1;
        entry.workspace = isDefault
          ? DEFAULT_WORKSPACE
          : `~/.remoteclaw/workspace-${id || DEFAULT_AGENT_ID}`;
      }
      mutated = true;
    }
  }

  // Step 3: Remove agents.defaults.workspace after consuming
  if (defaultsWorkspace && config.agents) {
    const defaults = (config.agents as Record<string, unknown>).defaults as
      | Record<string, unknown>
      | undefined;
    if (defaults) {
      delete defaults.workspace;
      if (Object.keys(defaults).length === 0) {
        delete (config.agents as Record<string, unknown>).defaults;
      }
      mutated = true;
    }
  }

  if (!mutated) {
    return jsonContent;
  }

  // Preserve original indentation style
  const indentMatch = jsonContent.match(/^(\s+)"/m);
  const indent = indentMatch?.[1] ?? "  ";
  return JSON.stringify(config, null, indent) + "\n";
}

/**
 * A single auth profile credential discovered during import, tagged
 * with the source file path for conflict reporting.
 */
type DiscoveredAuthProfile = {
  id: string;
  credential: Record<string, unknown>;
  sourceFile: string;
};

/**
 * Discover auth profile IDs from auth store files in the source directory.
 *
 * Walks the directory tree looking for `auth-profiles.json` (v1 format)
 * and legacy `auth.json` files. Returns deduplicated profile IDs.
 */
export function discoverSourceAuthProfileIds(sourceDir: string): string[] {
  return [...new Set(discoverSourceAuthProfiles(sourceDir).map((p) => p.id))];
}

/**
 * Discover full auth profile credentials from auth store files in the
 * source directory.
 *
 * Walks the directory tree looking for `auth-profiles.json` (v1 format)
 * and legacy `auth.json` files. Returns all discovered profiles with
 * their credentials and source paths for conflict detection.
 */
export function discoverSourceAuthProfiles(sourceDir: string): DiscoveredAuthProfile[] {
  const profiles: DiscoveredAuthProfile[] = [];

  const walk = (dir: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        if (entry.name === AUTH_PROFILES_FILENAME) {
          collectModernStore(fullPath, profiles);
        } else if (entry.name === LEGACY_AUTH_FILENAME) {
          collectLegacyStore(fullPath, profiles);
        }
      }
    }
  };

  walk(sourceDir);
  return profiles;
}

function collectModernStore(filePath: string, out: DiscoveredAuthProfile[]): void {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    if (raw?.profiles && typeof raw.profiles === "object") {
      for (const [id, credential] of Object.entries(raw.profiles)) {
        if (credential && typeof credential === "object") {
          out.push({ id, credential: credential as Record<string, unknown>, sourceFile: filePath });
        }
      }
    }
  } catch {
    /* ignore unreadable/malformed files */
  }
}

function collectLegacyStore(filePath: string, out: DiscoveredAuthProfile[]): void {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    if (typeof raw !== "object" || raw === null || "profiles" in raw) {
      return;
    }
    for (const [key, value] of Object.entries(raw)) {
      if (
        value &&
        typeof value === "object" &&
        ((value as Record<string, unknown>).type === "api_key" ||
          (value as Record<string, unknown>).type === "token")
      ) {
        out.push({
          id: `${key}:default`,
          credential: value as Record<string, unknown>,
          sourceFile: filePath,
        });
      }
    }
  } catch {
    /* ignore */
  }
}

/**
 * Materialize the `agents.defaults.auth` field from discovered auth profiles.
 *
 * OpenClaw configs don't have the `auth` field. After import, auth profiles
 * exist on disk but nothing in the config points to them. This function
 * detects the configured runtime and sets `agents.defaults.auth` to the
 * first profile whose provider matches the runtime.
 */
export function materializeAuthDefaults(
  jsonContent: string,
  discoveredProfileIds: string[],
): string {
  if (discoveredProfileIds.length === 0) {
    return jsonContent;
  }

  let config: Record<string, unknown>;
  try {
    config = JSON.parse(jsonContent);
  } catch {
    return jsonContent;
  }

  if (typeof config !== "object" || config === null || Array.isArray(config)) {
    return jsonContent;
  }

  const agents = config.agents as Record<string, unknown> | undefined;
  const defaults = agents?.defaults as Record<string, unknown> | undefined;

  // Skip if auth is already configured
  if (defaults?.auth !== undefined) {
    return jsonContent;
  }

  // Need a runtime to determine which provider to match
  const runtime = typeof defaults?.runtime === "string" ? defaults.runtime : undefined;
  if (!runtime) {
    return jsonContent;
  }

  const providers = RUNTIME_AUTH_PROVIDERS[runtime];
  if (!providers) {
    return jsonContent;
  }

  // Find first profile whose provider prefix matches the runtime
  const matchingProfileId = discoveredProfileIds.find((id) => {
    const colonIdx = id.indexOf(":");
    const provider = (colonIdx > 0 ? id.slice(0, colonIdx) : id).toLowerCase();
    return providers.includes(provider);
  });

  if (!matchingProfileId) {
    return jsonContent;
  }

  // Set agents.defaults.auth
  if (!config.agents) {
    config.agents = {};
  }
  const agentsObj = config.agents as Record<string, unknown>;
  if (!agentsObj.defaults) {
    agentsObj.defaults = {};
  }
  (agentsObj.defaults as Record<string, unknown>).auth = matchingProfileId;

  const indentMatch = jsonContent.match(/^(\s+)"/m);
  const indent = indentMatch?.[1] ?? "  ";
  return JSON.stringify(config, null, indent) + "\n";
}

/**
 * Consolidate discovered auth profiles into a single global auth store.
 *
 * Merges all profiles into one store, writing it to `targetDir/auth-profiles.json`.
 * When the same profile ID appears in multiple source files with different keys,
 * a warning is emitted and the first occurrence wins.
 */
export async function consolidateAuthProfiles(params: {
  profiles: DiscoveredAuthProfile[];
  targetDir: string;
  sourceDir: string;
  dryRun: boolean;
  result: ImportResult;
  runtime: RuntimeEnv;
}): Promise<void> {
  const { profiles, targetDir, sourceDir, dryRun, result, runtime } = params;
  if (profiles.length === 0) {
    return;
  }

  const merged: Record<string, Record<string, unknown>> = {};

  for (const { id, credential, sourceFile } of profiles) {
    if (id in merged) {
      // Check for conflict: same profile ID but different key value
      const existing = merged[id];
      if (existing.key !== credential.key) {
        const relPath = path.relative(sourceDir, sourceFile);
        const warning = `Auth profile "${id}" found in ${relPath} conflicts with earlier occurrence — keeping first`;
        result.authProfileConflicts.push(warning);
        runtime.log(`Warning: ${warning}`);
      }
      continue;
    }
    merged[id] = credential;
    result.consolidatedAuthProfiles.push(id);
  }

  if (!dryRun) {
    const store = {
      version: 1,
      profiles: merged,
    };
    const storePath = path.join(targetDir, AUTH_PROFILES_FILENAME);
    await fsp.mkdir(targetDir, { recursive: true });
    await fsp.writeFile(storePath, JSON.stringify(store, null, 2) + "\n", "utf-8");
  }
}

/**
 * Stamp `meta.lastTouchedVersion` and `meta.lastTouchedAt` on imported config JSON.
 *
 * OpenClaw configs carry the OpenClaw version in `meta.lastTouchedVersion`.
 * After import, RemoteClaw is the last tool that wrote the config, so the
 * version must be updated to prevent `warnIfConfigFromFuture()` from firing
 * a spurious "newer RemoteClaw" warning.
 */
export function stampImportedConfigVersion(jsonContent: string): string {
  let config: Record<string, unknown>;
  try {
    config = JSON.parse(jsonContent);
  } catch {
    return jsonContent;
  }

  if (typeof config !== "object" || config === null || Array.isArray(config)) {
    return jsonContent;
  }

  const meta = (config.meta ?? {}) as Record<string, unknown>;
  meta.lastTouchedVersion = VERSION;
  meta.lastTouchedAt = new Date().toISOString();
  config.meta = meta;

  const indentMatch = jsonContent.match(/^(\s+)"/m);
  const indent = indentMatch?.[1] ?? "  ";
  return JSON.stringify(config, null, indent) + "\n";
}

/**
 * Determine the target filename for a source file.
 * Renames openclaw.json -> remoteclaw.json at any directory level.
 */
export function resolveTargetFilename(filename: string): string {
  if (filename === OPENCLAW_CONFIG_FILENAME) {
    return REMOTECLAW_CONFIG_FILENAME;
  }
  return filename;
}

/**
 * Top-level entries in the OpenClaw state directory that should be imported.
 *
 * Only entries in this set (plus the `workspace-*` pattern) are copied from
 * the source root. Everything else — generated caches (`completions/`),
 * runtime state (`delivery-queue/`, `sandbox/`, `restart-sentinel.json`),
 * identity data (`identity/`), and removed subsystems (`packs/`) — is
 * intentionally skipped.
 *
 * Sub-directories within importable entries are copied recursively without
 * further filtering.
 */
const IMPORTABLE_ROOT_ENTRIES = new Set([
  // Config files
  OPENCLAW_CONFIG_FILENAME, // openclaw.json → remoteclaw.json
  REMOTECLAW_CONFIG_FILENAME, // remoteclaw.json (partially migrated source)
  ".env",

  // Agent state
  "agents",
  "agent", // Legacy root-level agent dir (pre-migration layout)
  "sessions", // Legacy sessions dir

  // Credentials and auth
  "credentials",

  // User customizations
  "extensions",
  "hooks",
  "includes",

  // Channel state
  "telegram",

  // Media and workspaces
  "media",
  "workspace",

  // Scheduled jobs
  "cron",

  // Paired device registry
  "devices",

  // User-authored canvas content
  "canvas",
]);

/**
 * Check whether a root-level entry name should be imported.
 * Matches the static allowlist plus `workspace-{agentId}` directories.
 */
export function isImportableRootEntry(name: string): boolean {
  if (IMPORTABLE_ROOT_ENTRIES.has(name)) {
    return true;
  }
  // Dynamic workspace directories: workspace-{agentId}
  if (name.startsWith("workspace-") && name.length > "workspace-".length) {
    return true;
  }
  return false;
}

/**
 * Check whether a file is a JSON/JSON5 config file that should be transformed.
 */
function isConfigFile(filename: string): boolean {
  return filename.endsWith(".json") || filename.endsWith(".json5");
}

/**
 * Recursively copy a directory, transforming config files along the way.
 *
 * When `filterRoot` is true (used for the top-level source directory),
 * only entries matching the importable allowlist are processed.
 * Sub-directories are always copied in full without filtering.
 */
async function copyDirectory(params: {
  sourceDir: string;
  targetDir: string;
  dryRun: boolean;
  filterRoot: boolean;
  result: ImportResult;
  discoveredAuthProfileIds: string[];
}): Promise<void> {
  const { sourceDir, targetDir, dryRun, filterRoot, result } = params;

  const entries = await fsp.readdir(sourceDir, { withFileTypes: true });

  if (!dryRun) {
    await fsp.mkdir(targetDir, { recursive: true });
  }

  for (const entry of entries) {
    if (filterRoot && !isImportableRootEntry(entry.name)) {
      result.skippedEntries.push(entry.name);
      continue;
    }

    const sourcePath = path.join(sourceDir, entry.name);
    const targetFilename = resolveTargetFilename(entry.name);
    const targetPath = path.join(targetDir, targetFilename);

    if (entry.isDirectory()) {
      await copyDirectory({
        sourceDir: sourcePath,
        targetDir: targetPath,
        dryRun,
        filterRoot: false,
        result,
        discoveredAuthProfileIds: params.discoveredAuthProfileIds,
      });
    } else if (entry.isFile()) {
      // Skip auth-profiles.json files — they are consolidated into the
      // global auth store separately, not copied per-agent.
      if (entry.name === AUTH_PROFILES_FILENAME) {
        continue;
      }
      if (isConfigFile(entry.name)) {
        const content = await fsp.readFile(sourcePath, "utf-8");
        const { content: transformed, renames } = transformConfigContent(content);
        // Apply structural config transforms to the main config file
        const isMainConfig = entry.name === OPENCLAW_CONFIG_FILENAME;
        const final = isMainConfig
          ? stampImportedConfigVersion(
              materializeAuthDefaults(
                materializeWorkspaceDefaults(
                  clearWizardSection(stripUnrecognizedConfigKeys(stripSchemaField(transformed))),
                ),
                params.discoveredAuthProfileIds,
              ),
            )
          : transformed;
        if (renames.length > 0 || final !== transformed) {
          result.transformedFiles.push(targetPath);
          result.envVarRenames.push(...renames);
        }
        if (!dryRun) {
          await fsp.writeFile(targetPath, final, "utf-8");
        }
        result.copiedFiles.push(targetPath);
      } else {
        if (!dryRun) {
          await fsp.copyFile(sourcePath, targetPath);
        }
        result.copiedFiles.push(targetPath);
      }
    }
  }
}

/**
 * Execute the import migration from an OpenClaw installation to RemoteClaw.
 */
export async function importCommand(
  opts: ImportOptions,
  runtime: RuntimeEnv = defaultRuntime,
): Promise<ImportResult> {
  const sourcePath = path.resolve(opts.sourcePath.replace(/^~/, process.env.HOME ?? "~"));
  const targetDir = resolveNewStateDir();

  // Validate source path exists
  if (!fs.existsSync(sourcePath)) {
    runtime.error(`Source path does not exist: ${shortenHomePath(sourcePath)}`);
    runtime.exit(1);
    return null as never;
  }

  const sourceStat = await fsp.stat(sourcePath);
  if (!sourceStat.isDirectory()) {
    runtime.error(`Source path is not a directory: ${shortenHomePath(sourcePath)}`);
    runtime.exit(1);
    return null as never;
  }

  // Check if target already exists
  const targetExists = fs.existsSync(targetDir);
  if (targetExists && !opts.yes && !opts.dryRun) {
    if (opts.nonInteractive) {
      runtime.error(
        `Target directory already exists: ${shortenHomePath(targetDir)}\nUse --yes to overwrite.`,
      );
      runtime.exit(1);
      return null as never;
    }

    const prompter = createClackPrompter();
    const shouldContinue = await prompter.confirm({
      message: `Target directory ${shortenHomePath(targetDir)} already exists. Merge imported files into it?`,
      initialValue: false,
    });

    if (!shouldContinue) {
      runtime.log("Import cancelled.");
      runtime.exit(0);
      return null as never;
    }
  }

  const result: ImportResult = {
    copiedFiles: [],
    transformedFiles: [],
    envVarRenames: [],
    skippedEntries: [],
    targetDir,
    consolidatedAuthProfiles: [],
    authProfileConflicts: [],
  };

  if (opts.dryRun) {
    runtime.log("Dry run — no files will be written.\n");
  }

  runtime.log(
    `Importing from ${shortenHomePath(sourcePath)} to ${shortenHomePath(targetDir)}...\n`,
  );

  const discoveredAuthProfiles = discoverSourceAuthProfiles(sourcePath);
  const discoveredAuthProfileIds = [...new Set(discoveredAuthProfiles.map((p) => p.id))];

  await copyDirectory({
    sourceDir: sourcePath,
    targetDir,
    dryRun: Boolean(opts.dryRun),
    filterRoot: true,
    result,
    discoveredAuthProfileIds,
  });

  await consolidateAuthProfiles({
    profiles: discoveredAuthProfiles,
    targetDir,
    sourceDir: sourcePath,
    dryRun: Boolean(opts.dryRun),
    result,
    runtime,
  });

  // Deduplicate env var renames for reporting
  result.envVarRenames = [...new Set(result.envVarRenames)];

  // Report results
  runtime.log(`Copied ${result.copiedFiles.length} file(s).`);
  if (result.transformedFiles.length > 0) {
    runtime.log(`Transformed ${result.transformedFiles.length} config file(s):`);
    for (const file of result.transformedFiles) {
      runtime.log(`  ${shortenHomePath(file)}`);
    }
  }
  if (result.envVarRenames.length > 0) {
    runtime.log(`\nEnv var renames:`);
    for (const rename of result.envVarRenames) {
      runtime.log(`  ${rename}`);
    }
  }

  if (result.consolidatedAuthProfiles.length > 0) {
    runtime.log(
      `\nConsolidated ${result.consolidatedAuthProfiles.length} auth profile(s) into global store:`,
    );
    for (const id of result.consolidatedAuthProfiles) {
      runtime.log(`  ${id}`);
    }
  }

  if (result.skippedEntries.length > 0) {
    runtime.log(`\nSkipped ${result.skippedEntries.length} non-importable entry(s):`);
    for (const entry of result.skippedEntries) {
      runtime.log(`  ${entry}`);
    }
  }

  if (opts.dryRun) {
    runtime.log("\nDry run complete — no changes were made.");
  } else {
    runtime.log("\nImport complete.");
  }

  return result;
}

/**
 * Detect whether an OpenClaw installation exists at the default location.
 * Used by the onboarding wizard to offer migration.
 */
export function detectOpenClawInstallation(
  homedir: string = process.env.HOME ?? "",
): string | null {
  const openclawDir = path.join(homedir, ".openclaw");
  if (fs.existsSync(openclawDir)) {
    try {
      const stat = fs.statSync(openclawDir);
      if (stat.isDirectory()) {
        return openclawDir;
      }
    } catch {
      // ignore
    }
  }
  return null;
}
