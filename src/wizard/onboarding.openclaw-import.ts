/**
 * OpenClaw config detection and import for the setup wizard.
 *
 * Used during first-run onboarding to detect an existing OpenClaw installation
 * and offer config migration. Reuses the pure import logic from config/import.ts.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import JSON5 from "json5";
import type { OnboardOptions } from "../commands/onboard-types.js";
import { importConfig } from "../config/import.js";
import type { ImportResult } from "../config/import.js";
import type { WizardPrompter } from "./prompts.js";

const OPENCLAW_STATE_DIRNAME = ".openclaw";
const OPENCLAW_CONFIG_FILENAME = "openclaw.json";

/**
 * Detect an existing OpenClaw config on disk.
 *
 * Checks:
 * 1. ~/.openclaw/openclaw.json (canonical)
 * 2. $OPENCLAW_STATE_DIR/openclaw.json (migration hint, if env var set)
 */
function detectOpenClawConfig(env: NodeJS.ProcessEnv): string | null {
  const home = env.HOME ?? env.USERPROFILE ?? os.homedir();
  const canonical = path.join(home, OPENCLAW_STATE_DIRNAME, OPENCLAW_CONFIG_FILENAME);
  if (fs.existsSync(canonical)) {
    return canonical;
  }

  const envDir = env.OPENCLAW_STATE_DIR?.trim();
  if (envDir) {
    const envPath = path.join(envDir, OPENCLAW_CONFIG_FILENAME);
    if (fs.existsSync(envPath)) {
      return envPath;
    }
  }

  return null;
}

function readJsonFile(filePath: string): Record<string, unknown> {
  const raw = fs.readFileSync(filePath, "utf-8");
  const parsed: unknown = JSON5.parse(raw);
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }
  throw new Error(`Expected a JSON object in ${filePath}`);
}

function shortenPath(filePath: string, env: NodeJS.ProcessEnv): string {
  const home = env.HOME ?? env.USERPROFILE ?? "";
  if (home && filePath.startsWith(home)) {
    return `~${filePath.slice(home.length)}`;
  }
  return filePath;
}

function formatImportReport(result: ImportResult): string {
  const lines: string[] = [];

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

  if (result.dropped.length > 0) {
    lines.push(`Dropped (${result.dropped.length} sections):`);
    for (const section of result.dropped) {
      lines.push(`  - ${section.key.padEnd(12)} -- ${section.reason}`);
    }
  }
  lines.push("");

  lines.push(result.sessionNote);

  return lines.join("\n");
}

/**
 * Find OPENCLAW_* environment variables that the user should migrate
 * to REMOTECLAW_* counterparts.
 */
function findOpenClawEnvVars(env: NodeJS.ProcessEnv): string[] {
  return Object.keys(env).filter((key) => key.startsWith("OPENCLAW_"));
}

function formatEnvVarReminder(openclawVars: string[]): string {
  return [
    "The following OpenClaw environment variables are set in your shell:",
    "",
    ...openclawVars.map((v) => `  ${v} \u2192 ${v.replace(/^OPENCLAW_/, "REMOTECLAW_")}`),
    "",
    "Update your shell profile to use the REMOTECLAW_* equivalents.",
    "RemoteClaw does not read OPENCLAW_* vars at runtime.",
  ].join("\n");
}

export type OpenClawImportOutcome = {
  /** Whether the user chose to import their OpenClaw config. */
  imported: boolean;
  /** The imported config (plain object), or null if not imported. */
  config: Record<string, unknown> | null;
};

/**
 * Detect an existing OpenClaw config and offer the user a choice to import it.
 *
 * Call this when no RemoteClaw config exists (first run). The caller is
 * responsible for checking that condition and writing the returned config.
 *
 * Skips detection when running in non-interactive mode (proceeds as "start fresh").
 */
export async function detectAndOfferOpenClawImport(params: {
  opts: OnboardOptions;
  prompter: WizardPrompter;
  env?: NodeJS.ProcessEnv;
}): Promise<OpenClawImportOutcome> {
  const env = params.env ?? process.env;
  const noImport: OpenClawImportOutcome = { imported: false, config: null };

  const sourcePath = detectOpenClawConfig(env);
  if (!sourcePath) {
    return noImport;
  }

  // Non-interactive: skip import, proceed fresh
  if (params.opts.nonInteractive) {
    return noImport;
  }

  let source: Record<string, unknown>;
  try {
    source = readJsonFile(sourcePath);
  } catch {
    return noImport;
  }

  const shortPath = shortenPath(sourcePath, env);

  // Prompt loop (preview re-presents the prompt)
  for (;;) {
    await params.prompter.note(
      [
        `Existing OpenClaw config detected at ${shortPath}`,
        "",
        "Would you like to import your channel and agent configuration?",
        "Skills, plugins, and model catalog will not be imported.",
      ].join("\n"),
      "OpenClaw migration",
    );

    const choice = await params.prompter.select({
      message: "Import OpenClaw config?",
      options: [
        { value: "import", label: "Import config" },
        { value: "fresh", label: "Start fresh" },
        { value: "preview", label: "Show what will be imported" },
      ],
    });

    if (choice === "fresh") {
      return noImport;
    }

    if (choice === "preview") {
      const previewResult = importConfig(source, null, "overwrite");
      await params.prompter.note(formatImportReport(previewResult), "Import preview");
      continue;
    }

    // choice === "import"
    const result = importConfig(source, null, "overwrite");

    await params.prompter.note(formatImportReport(result), "Import complete");

    // Remind user about OPENCLAW_* env vars that need migration
    const openclawVars = findOpenClawEnvVars(env);
    if (openclawVars.length > 0) {
      await params.prompter.note(formatEnvVarReminder(openclawVars), "Environment variables");
    }

    return { imported: true, config: result.config };
  }
}
