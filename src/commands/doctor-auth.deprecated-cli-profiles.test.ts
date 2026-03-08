import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RemoteClawConfig } from "../config/config.js";
import { captureEnv } from "../test-utils/env.js";
import { maybeRemoveDeprecatedCliAuthProfiles } from "./doctor-auth.js";
import type { DoctorPrompter } from "./doctor-prompter.js";

let envSnapshot: ReturnType<typeof captureEnv>;
let tempStateDir: string | undefined;

function makePrompter(confirmValue: boolean): DoctorPrompter {
  return {
    confirm: vi.fn().mockResolvedValue(confirmValue),
    confirmRepair: vi.fn().mockResolvedValue(confirmValue),
    confirmAggressive: vi.fn().mockResolvedValue(confirmValue),
    confirmSkipInNonInteractive: vi.fn().mockResolvedValue(confirmValue),
    select: vi.fn().mockResolvedValue(""),
    shouldRepair: confirmValue,
    shouldForce: false,
  };
}

beforeEach(() => {
  envSnapshot = captureEnv(["REMOTECLAW_STATE_DIR", "REMOTECLAW_AGENT_DIR", "PI_CODING_AGENT_DIR"]);
  tempStateDir = fs.mkdtempSync(path.join(os.tmpdir(), "remoteclaw-auth-"));
  process.env.REMOTECLAW_STATE_DIR = tempStateDir;
});

afterEach(() => {
  envSnapshot.restore();
  if (tempStateDir) {
    fs.rmSync(tempStateDir, { recursive: true, force: true });
    tempStateDir = undefined;
  }
});

describe("maybeRemoveDeprecatedCliAuthProfiles", () => {
  it("removes deprecated CLI auth profiles from store + config", async () => {
    if (!tempStateDir) {
      throw new Error("Missing temp state dir");
    }
    const authPath = path.join(tempStateDir, "auth-profiles.json");
    fs.writeFileSync(
      authPath,
      `${JSON.stringify(
        {
          version: 1,
          profiles: {
            "anthropic:claude-cli": {
              type: "api_key",
              provider: "anthropic",
              key: "sk-ant-cli-key",
            },
            "openai-codex:codex-cli": {
              type: "api_key",
              provider: "openai-codex",
              key: "sk-codex-cli-key",
            },
          },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const cfg = {
      auth: {
        profiles: {
          "anthropic:claude-cli": { provider: "anthropic", mode: "api_key" },
          "openai-codex:codex-cli": { provider: "openai-codex", mode: "api_key" },
        },
      },
    } as const;

    const next = await maybeRemoveDeprecatedCliAuthProfiles(
      cfg as unknown as RemoteClawConfig,
      makePrompter(true),
    );

    const raw = JSON.parse(fs.readFileSync(authPath, "utf8")) as {
      profiles?: Record<string, unknown>;
    };
    expect(raw.profiles?.["anthropic:claude-cli"]).toBeUndefined();
    expect(raw.profiles?.["openai-codex:codex-cli"]).toBeUndefined();

    expect(next.auth?.profiles?.["anthropic:claude-cli"]).toBeUndefined();
    expect(next.auth?.profiles?.["openai-codex:codex-cli"]).toBeUndefined();
  });
});
