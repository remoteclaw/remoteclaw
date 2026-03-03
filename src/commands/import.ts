import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { resolveNewStateDir } from "../config/paths.js";
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
      });
    } else if (entry.isFile()) {
      if (isConfigFile(entry.name)) {
        const content = await fsp.readFile(sourcePath, "utf-8");
        const { content: transformed, renames } = transformConfigContent(content);
        if (renames.length > 0) {
          result.transformedFiles.push(targetPath);
          result.envVarRenames.push(...renames);
        }
        if (!dryRun) {
          await fsp.writeFile(targetPath, transformed, "utf-8");
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

  await copyDirectory({
    sourceDir: sourcePath,
    targetDir,
    dryRun: Boolean(opts.dryRun),
    result,
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
