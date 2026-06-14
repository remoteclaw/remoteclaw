import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthProfileStore } from "../agents/auth-profiles/types.js";
import type { RemoteClawConfig } from "../config/config.js";
import { captureEnv } from "../test-utils/env.js";
import { maybeRemoveDeprecatedCliAuthProfiles } from "./doctor-auth.js";
import type { DoctorPrompter } from "./doctor-prompter.js";

vi.mock("../agents/auth-profiles/repair.js", () => ({
  repairOAuthProfileIdMismatch: repairMocks.repairOAuthProfileIdMismatch,
}));

vi.mock("../agents/auth-profiles/store.js", () => ({
  ensureAuthProfileStore: () => authProfileStoreMock.store,
}));

vi.mock("../terminal/note.js", () => ({
  note: vi.fn(),
}));

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
  envSnapshot = captureEnv(["REMOTECLAW_AGENT_DIR", "PI_CODING_AGENT_DIR"]);
  tempAgentDir = fs.mkdtempSync(path.join(os.tmpdir(), "remoteclaw-auth-"));
  process.env.REMOTECLAW_AGENT_DIR = tempAgentDir;
  process.env.PI_CODING_AGENT_DIR = tempAgentDir;
});

afterEach(() => {
  envSnapshot.restore();
  if (tempAgentDir) {
    fs.rmSync(tempAgentDir, { recursive: true, force: true });
    tempAgentDir = undefined;
  }
});

describe("maybeRemoveDeprecatedCliAuthProfiles", () => {
  it("removes deprecated CLI auth profiles from store + config", async () => {
    if (!tempAgentDir) {
      throw new Error("Missing temp agent dir");
    }
    const authPath = path.join(tempAgentDir, "auth-profiles.json");
    fs.writeFileSync(
      authPath,
      `${JSON.stringify(
        {
          version: 1,
          profiles: {
            "anthropic:claude-cli": {
              type: "oauth",
              provider: "anthropic",
              access: "token-a",
              refresh: "token-r",
              expires: Date.now() + 60_000,
            },
            "openai-codex:codex-cli": {
              type: "oauth",
              provider: "openai-codex",
              access: "token-b",
              refresh: "token-r2",
              expires: Date.now() + 60_000,
            },
            "openai-codex:default": {
              type: "oauth",
              provider: "openai-codex",
              access: "token-c",
              refresh: "token-r3",
              expires: Date.now() + 60_000,
            },
          },
        },
      },
      lastGood: {
        anthropic: "anthropic:user@example.com",
      },
    };

    const cfg = {
      auth: {
        profiles: {
          "anthropic:claude-cli": { provider: "anthropic", mode: "oauth" },
          "openai-codex:codex-cli": { provider: "openai-codex", mode: "oauth" },
          "openai-codex:default": { provider: "openai-codex", mode: "oauth" },
        },
        order: {
          anthropic: ["anthropic:claude-cli"],
          "openai-codex": ["openai-codex:codex-cli", "openai-codex:default"],
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
    expect(raw.profiles?.["openai-codex:default"]).toBeDefined();

    expect(next.auth?.profiles?.["anthropic:claude-cli"]).toBeUndefined();
    expect(next.auth?.profiles?.["openai-codex:codex-cli"]).toBeUndefined();
    expect(next.auth?.profiles?.["openai-codex:default"]).toBeDefined();
    expect(next.auth?.order?.anthropic).toBeUndefined();
    expect(next.auth?.order?.["openai-codex"]).toEqual(["openai-codex:default"]);
  });
});
