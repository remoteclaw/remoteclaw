import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { resolveNewStateDir } from "../config/paths.js";
import { RemoteClawSchema } from "../config/zod-schema.js";
import type { RuntimeEnv } from "../runtime.js";
import { defaultRuntime } from "../runtime.js";
import { shortenHomePath } from "../utils.js";
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
  targetDir: string;
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
 * Discover auth profile IDs from auth store files in the source directory.
 *
 * Walks the directory tree looking for `auth-profiles.json` (v1 format)
 * and legacy `auth.json` files. Returns deduplicated profile IDs.
 */
export function discoverSourceAuthProfileIds(sourceDir: string): string[] {
  const profileIds: string[] = [];

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
          collectModernStore(fullPath, profileIds);
        } else if (entry.name === LEGACY_AUTH_FILENAME) {
          collectLegacyStore(fullPath, profileIds);
        }
      }
    }
  };

  walk(sourceDir);
  return [...new Set(profileIds)];
}

function collectModernStore(filePath: string, out: string[]): void {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    if (raw?.profiles && typeof raw.profiles === "object") {
      out.push(...Object.keys(raw.profiles));
    }
  } catch {
    /* ignore unreadable/malformed files */
  }
}

function collectLegacyStore(filePath: string, out: string[]): void {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    if (typeof raw !== "object" || raw === null || "profiles" in raw) {
      return;
    }
    for (const [key, value] of Object.entries(raw)) {
      if (
        value &&
        typeof value === "object" &&
        (value as Record<string, unknown>).type === "api_key"
      ) {
        out.push(`${key}:default`);
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
 * Check whether a file is a JSON/JSON5 config file that should be transformed.
 */
function isConfigFile(filename: string): boolean {
  return filename.endsWith(".json") || filename.endsWith(".json5");
}

/**
 * Recursively copy a directory, transforming config files along the way.
 */
async function copyDirectory(params: {
  sourceDir: string;
  targetDir: string;
  dryRun: boolean;
  result: ImportResult;
  discoveredAuthProfileIds: string[];
}): Promise<void> {
  const { sourceDir, targetDir, dryRun, result } = params;

  const entries = await fsp.readdir(sourceDir, { withFileTypes: true });

  if (!dryRun) {
    await fsp.mkdir(targetDir, { recursive: true });
  }

  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetFilename = resolveTargetFilename(entry.name);
    const targetPath = path.join(targetDir, targetFilename);

    if (entry.isDirectory()) {
      await copyDirectory({
        sourceDir: sourcePath,
        targetDir: targetPath,
        dryRun,
        result,
        discoveredAuthProfileIds: params.discoveredAuthProfileIds,
      });
    } else if (entry.isFile()) {
      if (isConfigFile(entry.name)) {
        const content = await fsp.readFile(sourcePath, "utf-8");
        const { content: transformed, renames } = transformConfigContent(content);
        // Apply structural config transforms to the main config file
        const isMainConfig = entry.name === OPENCLAW_CONFIG_FILENAME;
        const final = isMainConfig
          ? materializeAuthDefaults(
              materializeWorkspaceDefaults(stripUnrecognizedConfigKeys(transformed)),
              params.discoveredAuthProfileIds,
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
    targetDir,
  };

  if (opts.dryRun) {
    runtime.log("Dry run — no files will be written.\n");
  }

  runtime.log(
    `Importing from ${shortenHomePath(sourcePath)} to ${shortenHomePath(targetDir)}...\n`,
  );

  const discoveredAuthProfileIds = discoverSourceAuthProfileIds(sourcePath);

  await copyDirectory({
    sourceDir: sourcePath,
    targetDir,
    dryRun: Boolean(opts.dryRun),
    result,
    discoveredAuthProfileIds,
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
