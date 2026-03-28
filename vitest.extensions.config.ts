import fs from "node:fs";
import { createScopedVitestConfig } from "./vitest.scoped-config.ts";

function loadPatternListFile(filePath: string, label: string): string[] {
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
  if (!Array.isArray(parsed)) {
    throw new TypeError(`${label} must point to a JSON array: ${filePath}`);
  }
  return parsed.filter((value): value is string => typeof value === "string" && value.length > 0);
}

export function loadIncludePatternsFromEnv(
  env: Record<string, string | undefined> = process.env,
): string[] | null {
  const includeFile = env.REMOTECLAW_VITEST_INCLUDE_FILE?.trim();
  if (!includeFile) {
    return null;
  }
  return loadPatternListFile(includeFile, "REMOTECLAW_VITEST_INCLUDE_FILE");
}

export default createScopedVitestConfig(
  loadIncludePatternsFromEnv() ?? ["extensions/**/*.test.ts"],
  {
    dir: "extensions",
    pool: "threads",
    passWithNoTests: true,
  },
);
