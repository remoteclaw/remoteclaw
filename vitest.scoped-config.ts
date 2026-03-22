import { defineConfig } from "vitest/config";
import baseConfig from "./vitest.config.ts";

export function createScopedVitestConfig(
  include: string[],
  options?: {
    pool?: "threads" | "forks";
    passWithNoTests?: boolean;
  },
) {
  const base = baseConfig as unknown as Record<string, unknown>;
  const baseTest = (baseConfig as { test?: { exclude?: string[] } }).test ?? {};
  const exclude = baseTest.exclude ?? [];

  return defineConfig({
    ...base,
    test: {
      ...baseTest,
      include,
      exclude,
      ...(options?.pool ? { pool: options.pool } : {}),
      ...(options?.passWithNoTests !== undefined
        ? { passWithNoTests: options.passWithNoTests }
        : {}),
    },
  });
}
