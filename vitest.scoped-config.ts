import { defineConfig } from "vitest/config";
import baseConfig from "./vitest.config.ts";

export function resolveVitestIsolation(
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (env.REMOTECLAW_TEST_ISOLATE === "1") {
    return true;
  }
  const noIsolate = env.REMOTECLAW_TEST_NO_ISOLATE;
  if (noIsolate === "0" || noIsolate === "false") {
    return true;
  }
  return false;
}

export function createScopedVitestConfig(include: string[], options?: { dir?: string }) {
  const base = baseConfig as unknown as Record<string, unknown>;
  const baseTest = (baseConfig as { test?: { exclude?: string[] } }).test ?? {};
  const exclude = baseTest.exclude ?? [];
  const isolate = resolveVitestIsolation();

  return defineConfig({
    ...base,
    test: {
      ...baseTest,
      include,
      exclude,
      isolate,
      ...(options?.dir ? { dir: options.dir } : {}),
    },
  });
}
