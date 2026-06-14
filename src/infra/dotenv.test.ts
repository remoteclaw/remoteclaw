import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { loadDotEnv } from "./dotenv.js";

const CREDENTIAL_AND_GATEWAY_ENV_KEYS = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_API_KEY_SECONDARY",
  "ANTHROPIC_OAUTH_TOKEN",
  "OPENAI_API_KEY",
  "OPENAI_API_KEYS",
  "OPENAI_API_KEY_SECONDARY",
  "REMOTECLAW_LIVE_ANTHROPIC_KEY",
  "REMOTECLAW_LIVE_ANTHROPIC_KEYS",
  "REMOTECLAW_LIVE_GEMINI_KEY",
  "REMOTECLAW_LIVE_OPENAI_KEY",
  "REMOTECLAW_GATEWAY_TOKEN",
  "REMOTECLAW_GATEWAY_PASSWORD",
  "REMOTECLAW_GATEWAY_SECRET",
] as const;

const BUNDLED_TRUST_ROOT_ENV_LINES = [
  "REMOTECLAW_BROWSER_CONTROL_MODULE=data:text/javascript,boom",
  "REMOTECLAW_BUNDLED_HOOKS_DIR=./attacker-hooks",
  "REMOTECLAW_BUNDLED_PLUGINS_DIR=./attacker-plugins",
  "REMOTECLAW_BUNDLED_SKILLS_DIR=./attacker-skills",
  "REMOTECLAW_SKIP_BROWSER_CONTROL_SERVER=1",
] as const;

const BUNDLED_TRUST_ROOT_ENV_KEYS = BUNDLED_TRUST_ROOT_ENV_LINES.map(
  (line) => line.split("=")[0] ?? "",
);

async function writeEnvFile(filePath: string, contents: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, contents, "utf8");
}

function clearEnv(keys: readonly string[]) {
  for (const key of keys) {
    delete process.env[key];
  }
}

function expectEnvUndefined(keys: readonly string[]) {
  for (const key of keys) {
    expect(process.env[key]).toBeUndefined();
  }
}

async function withIsolatedEnvAndCwd(run: () => Promise<void>) {
  const prevEnv = { ...process.env };
  try {
    await run();
  } finally {
    vi.restoreAllMocks();
    for (const key of Object.keys(process.env)) {
      if (!(key in prevEnv)) {
        delete process.env[key];
      }
    }
    for (const [key, value] of Object.entries(prevEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

type DotEnvFixture = {
  base: string;
  cwdDir: string;
  stateDir: string;
};

async function withDotEnvFixture(run: (fixture: DotEnvFixture) => Promise<void>) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "remoteclaw-dotenv-test-"));
  const cwdDir = path.join(base, "cwd");
  const stateDir = path.join(base, "state");
  process.env.REMOTECLAW_STATE_DIR = stateDir;
  await fs.mkdir(cwdDir, { recursive: true });
  await fs.mkdir(stateDir, { recursive: true });
  await run({ base, cwdDir, stateDir });
}

describe("loadDotEnv", () => {
  it("loads ~/.remoteclaw/.env as fallback without overriding CWD .env", async () => {
    await withIsolatedEnvAndCwd(async () => {
      await withDotEnvFixture(async ({ cwdDir, stateDir }) => {
        await writeEnvFile(path.join(stateDir, ".env"), "FOO=from-global\nBAR=1\n");
        await writeEnvFile(path.join(cwdDir, ".env"), "FOO=from-cwd\n");

        vi.spyOn(process, "cwd").mockReturnValue(cwdDir);
        delete process.env.FOO;
        delete process.env.BAR;

        loadDotEnv({ quiet: true });

        expect(process.env.FOO).toBe("from-cwd");
        expect(process.env.BAR).toBe("1");
      });
    });
  });

  it("does not override an already-set env var from the shell", async () => {
    await withIsolatedEnvAndCwd(async () => {
      await withDotEnvFixture(async ({ cwdDir, stateDir }) => {
        process.env.FOO = "from-shell";

        await writeEnvFile(path.join(stateDir, ".env"), "FOO=from-global\n");
        await writeEnvFile(path.join(cwdDir, ".env"), "FOO=from-cwd\n");

        vi.spyOn(process, "cwd").mockReturnValue(cwdDir);

        loadDotEnv({ quiet: true });

        expect(process.env.FOO).toBe("from-shell");
      });
    });
  });

  it("loads fallback state .env when CWD .env is missing", async () => {
    await withIsolatedEnvAndCwd(async () => {
      await withDotEnvFixture(async ({ cwdDir, stateDir }) => {
        await writeEnvFile(path.join(stateDir, ".env"), "FOO=from-global\n");
        vi.spyOn(process, "cwd").mockReturnValue(cwdDir);
        delete process.env.FOO;

        loadDotEnv({ quiet: true });

        expect(process.env.FOO).toBe("from-global");
      });
    });
  });
});
