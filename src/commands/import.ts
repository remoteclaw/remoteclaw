import fs from "node:fs";
import path from "node:path";
import JSON5 from "json5";
import { importConfig } from "../config/import.js";
import type { ImportMode, ImportResult } from "../config/import.js";
import { resolveCanonicalConfigPath } from "../config/paths.js";
import type { RuntimeEnv } from "../runtime.js";

/**
 * Source config filename candidates, checked in order.
 * Prefers the original OpenClaw filename, falls back to a partially-migrated
 * RemoteClaw filename in the same directory.
 */
const SOURCE_FILENAMES = ["openclaw.json", "remoteclaw.json"] as const;

type ImportCommandOptions = {
  dryRun?: boolean;
  overwrite?: boolean;
  merge?: boolean;
};

function resolveSourcePath(dir: string): string | null {
  const resolved = path.resolve(dir);
  for (const filename of SOURCE_FILENAMES) {
    const candidate = path.join(resolved, filename);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function readJsonFile(filePath: string): Record<string, unknown> {
  const raw = fs.readFileSync(filePath, "utf-8");
  const parsed = JSON5.parse(raw);
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }
  throw new Error(`Expected a JSON object in ${filePath}`);
}

function resolveMode(opts: ImportCommandOptions): ImportMode {
  if (opts.merge) {
    return "merge";
  }
  if (opts.overwrite) {
    return "overwrite";
  }
  return "error";
}

function shortenPath(filePath: string): string {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
  if (home && filePath.startsWith(home)) {
    return `~${filePath.slice(home.length)}`;
  }
  return filePath;
}

function findOpenClawEnvVars(env: NodeJS.ProcessEnv): string[] {
  return Object.keys(env).filter((key) => key.startsWith("OPENCLAW_"));
}

function formatEnvVarReminder(openclawVars: string[]): string {
  const lines: string[] = ["Environment variables:"];
  for (const v of openclawVars) {
    const replacement = v.replace(/^OPENCLAW_/, "REMOTECLAW_");
    lines.push(`  ${v} is set \u2192 add ${replacement} to your shell profile`);
  }
  return lines.join("\n");
}

function formatReport(
  sourcePath: string,
  destPath: string,
  result: ImportResult,
  dryRun: boolean,
): string {
  const lines: string[] = [];

  if (dryRun) {
    lines.push("[dry run] No files were written.");
  }

  lines.push(`Importing from: ${sourcePath}`);
  lines.push(`Destination:    ${destPath}`);
  lines.push("");

  // Imported sections
  if (result.imported.length > 0) {
    lines.push(`Imported (${result.imported.length} sections):`);
    for (const section of result.imported) {
      lines.push(`  + ${section.key.padEnd(12)} -- ${section.summary}`);
    }
  } else {
    lines.push("Imported (0 sections):");
    lines.push("  (none)");
  }
  lines.push("");

  // Dropped sections
  if (result.dropped.length > 0) {
    lines.push(`Dropped (${result.dropped.length} sections):`);
    for (const section of result.dropped) {
      lines.push(`  - ${section.key.padEnd(12)} -- ${section.reason}`);
    }
  }
  lines.push("");

  // Session note
  lines.push(result.sessionNote);

  if (!dryRun) {
    lines.push("");
    lines.push("Done. Run `remoteclaw gateway start` to launch.");
  }

  return lines.join("\n");
}

export async function importCommand(
  sourceDir: string,
  opts: ImportCommandOptions,
  runtime: RuntimeEnv,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  // 1. Locate source config
  const sourcePath = resolveSourcePath(sourceDir);
  if (!sourcePath) {
    const tried = SOURCE_FILENAMES.map((f) => path.join(sourceDir, f)).join(", ");
    runtime.error(`No config file found. Tried: ${tried}`);
    runtime.exit(1);
    return;
  }

  // 2. Read source config
  let source: Record<string, unknown>;
  try {
    source = readJsonFile(sourcePath);
  } catch (err) {
    runtime.error(`Failed to read ${sourcePath}: ${String(err)}`);
    runtime.exit(1);
    return;
  }

  // 3. Resolve destination path
  const destPath = resolveCanonicalConfigPath();
  const mode = resolveMode(opts);

  // 4. Check destination for "error" mode (default)
  if (mode === "error" && fs.existsSync(destPath)) {
    runtime.error(
      `Destination already exists: ${shortenPath(destPath)}\n` +
        "Use --overwrite to replace or --merge to merge (existing values win).",
    );
    runtime.exit(1);
    return;
  }

  // 5. Read existing config for merge mode
  let existing: Record<string, unknown> | null = null;
  if (mode === "merge" && fs.existsSync(destPath)) {
    try {
      existing = readJsonFile(destPath);
    } catch (err) {
      runtime.error(`Failed to read existing config ${destPath}: ${String(err)}`);
      runtime.exit(1);
      return;
    }
  }

  // 6. Run the import
  const result = importConfig(source, existing, mode);

  // 7. Print report
  const report = formatReport(sourcePath, shortenPath(destPath), result, Boolean(opts.dryRun));
  runtime.log(report);

  // 8. Print env var migration reminders if OPENCLAW_* vars are detected
  const openclawVars = findOpenClawEnvVars(env);
  if (openclawVars.length > 0) {
    runtime.log("");
    runtime.log(formatEnvVarReminder(openclawVars));
  }

  // 9. Write unless dry-run
  if (opts.dryRun) {
    return;
  }

  const destDir = path.dirname(destPath);
  fs.mkdirSync(destDir, { recursive: true, mode: 0o700 });
  const json = JSON.stringify(result.config, null, 2).trimEnd().concat("\n");
  fs.writeFileSync(destPath, json, { encoding: "utf-8", mode: 0o600 });
}
