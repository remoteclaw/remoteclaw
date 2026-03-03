import fs from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { describe, expect, it, vi } from "vitest";
import { makeTempWorkspace } from "../test-helpers/workspace.js";
import { withEnvAsync } from "../test-utils/env.js";
import {
  createThrowingRuntime,
  readJsonFile,
  type NonInteractiveRuntime,
} from "./onboard-non-interactive.test-helpers.js";

type OnboardEnv = {
  configPath: string;
  runtime: NonInteractiveRuntime;
};

const ensureWorkspaceAndSessionsMock = vi.fn(async (..._args: unknown[]) => {});

vi.mock("./onboard-helpers.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./onboard-helpers.js")>();
  return {
    ...actual,
    ensureWorkspaceAndSessions: ensureWorkspaceAndSessionsMock,
  };
});

const { runNonInteractiveOnboarding } = await import("./onboard-non-interactive.js");

const NON_INTERACTIVE_DEFAULT_OPTIONS = {
  nonInteractive: true,
  skipHealth: true,
  skipChannels: true,
  json: true,
} as const;

async function removeDirWithRetry(dir: string): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await fs.rm(dir, { recursive: true, force: true });
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      const isTransient = code === "ENOTEMPTY" || code === "EBUSY" || code === "EPERM";
      if (!isTransient || attempt === 4) {
        throw error;
      }
      await delay(10 * (attempt + 1));
    }
  }
}

async function withOnboardEnv(
  prefix: string,
  run: (ctx: OnboardEnv) => Promise<void>,
): Promise<void> {
  const tempHome = await makeTempWorkspace(prefix);
  const configPath = path.join(tempHome, "remoteclaw.json");
  const runtime = createThrowingRuntime();

  try {
    await withEnvAsync(
      {
        HOME: tempHome,
        REMOTECLAW_STATE_DIR: tempHome,
        REMOTECLAW_CONFIG_PATH: configPath,
        REMOTECLAW_SKIP_CHANNELS: "1",
        REMOTECLAW_SKIP_GMAIL_WATCHER: "1",
        REMOTECLAW_SKIP_CRON: "1",
        REMOTECLAW_SKIP_CANVAS_HOST: "1",
        REMOTECLAW_GATEWAY_TOKEN: undefined,
        REMOTECLAW_GATEWAY_PASSWORD: undefined,
        REMOTECLAW_DISABLE_CONFIG_CACHE: "1",
      },
      async () => {
        await run({ configPath, runtime });
      },
    );
  } finally {
    await removeDirWithRetry(tempHome);
  }
}

type RuntimeConfigSnapshot = {
  agents?: { defaults?: { runtime?: string } };
};

async function runNonInteractiveOnboardingWithDefaults(
  runtime: NonInteractiveRuntime,
  options: Record<string, unknown>,
): Promise<void> {
  await runNonInteractiveOnboarding(
    {
      ...NON_INTERACTIVE_DEFAULT_OPTIONS,
      ...options,
    },
    runtime,
  );
}

describe("onboard (non-interactive): runtime auth", () => {
  it("stores runtime selection in config when --runtime is provided", async () => {
    await withOnboardEnv("openclaw-onboard-runtime-claude-", async ({ configPath, runtime }) => {
      await runNonInteractiveOnboardingWithDefaults(runtime, {
        runtime: "claude",
        skipSkills: true,
      });
      const config = await readJsonFile<RuntimeConfigSnapshot>(configPath);
      expect(config.agents?.defaults?.runtime).toBe("claude");
    });
  });

  it("infers claude runtime from --anthropic-api-key", async () => {
    await withOnboardEnv("openclaw-onboard-infer-claude-", async ({ configPath, runtime }) => {
      await runNonInteractiveOnboardingWithDefaults(runtime, {
        anthropicApiKey: "sk-ant-test-key",
        skipSkills: true,
      });
      const config = await readJsonFile<RuntimeConfigSnapshot>(configPath);
      expect(config.agents?.defaults?.runtime).toBe("claude");
    });
  });

  it("infers gemini runtime from --gemini-api-key", async () => {
    await withOnboardEnv("openclaw-onboard-infer-gemini-", async ({ configPath, runtime }) => {
      await runNonInteractiveOnboardingWithDefaults(runtime, {
        geminiApiKey: "gemini-test-key",
        skipSkills: true,
      });
      const config = await readJsonFile<RuntimeConfigSnapshot>(configPath);
      expect(config.agents?.defaults?.runtime).toBe("gemini");
    });
  });

  it("infers codex runtime from --codex-api-key", async () => {
    await withOnboardEnv("openclaw-onboard-infer-codex-", async ({ configPath, runtime }) => {
      await runNonInteractiveOnboardingWithDefaults(runtime, {
        codexApiKey: "codex-test-key",
        skipSkills: true,
      });
      const config = await readJsonFile<RuntimeConfigSnapshot>(configPath);
      expect(config.agents?.defaults?.runtime).toBe("codex");
    });
  });

  it("infers opencode runtime from --openai-api-key", async () => {
    await withOnboardEnv("openclaw-onboard-infer-opencode-", async ({ configPath, runtime }) => {
      await runNonInteractiveOnboardingWithDefaults(runtime, {
        openaiApiKey: "sk-openai-test-key",
        skipSkills: true,
      });
      const config = await readJsonFile<RuntimeConfigSnapshot>(configPath);
      expect(config.agents?.defaults?.runtime).toBe("opencode");
    });
  });

  it("infers claude runtime from --auth-token", async () => {
    await withOnboardEnv("openclaw-onboard-auth-token-", async ({ configPath, runtime }) => {
      await runNonInteractiveOnboardingWithDefaults(runtime, {
        authToken: "my-oauth-token",
        skipSkills: true,
      });
      const config = await readJsonFile<RuntimeConfigSnapshot>(configPath);
      expect(config.agents?.defaults?.runtime).toBe("claude");
    });
  });

  it("completes without error when no runtime or key is provided (skip mode)", async () => {
    await withOnboardEnv("openclaw-onboard-no-runtime-", async ({ configPath, runtime }) => {
      await runNonInteractiveOnboardingWithDefaults(runtime, {
        skipSkills: true,
      });
      const config = await readJsonFile<RuntimeConfigSnapshot>(configPath);
      // No runtime set when none specified.
      expect(config.agents?.defaults?.runtime).toBeUndefined();
    });
  });
});
