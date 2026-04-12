import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { RemoteClawConfig } from "../config/config.js";
import type { SessionEntry } from "../config/sessions.js";
import { detectLegacyStateMigrations, runLegacyStateMigrations } from "./state-migrations.js";

// ─── Fixture plumbing ────────────────────────────────────────────────────

let fixtureRoot = "";
let caseCounter = 0;
let envSnapshot: Record<string, string | undefined> = {};

async function createStateDir(prefix: string): Promise<string> {
  const dir = path.join(fixtureRoot, `${prefix}-${caseCounter++}`);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

function snapshotEnv(keys: string[]): void {
  envSnapshot = {};
  for (const key of keys) {
    envSnapshot[key] = process.env[key];
  }
}

function restoreEnv(): void {
  for (const [key, value] of Object.entries(envSnapshot)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  envSnapshot = {};
}

type StoreEntryFixture = SessionEntry & Record<string, unknown>;

async function writeSessionStore(
  storePath: string,
  store: Record<string, StoreEntryFixture>,
): Promise<void> {
  await fs.mkdir(path.dirname(storePath), { recursive: true });
  await fs.writeFile(storePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

async function readSessionStoreDirect(
  storePath: string,
): Promise<Record<string, StoreEntryFixture>> {
  const raw = await fs.readFile(storePath, "utf8");
  return JSON.parse(raw) as Record<string, StoreEntryFixture>;
}

function buildConfig(agentIds: string[]): RemoteClawConfig {
  return {
    agents: {
      list: agentIds.map((id) => ({ id, workspace: "~/w" })),
    },
  };
}

function makeEntry(updatedAt: number, sessionIdSuffix = ""): StoreEntryFixture {
  return {
    sessionId: `session-${updatedAt}${sessionIdSuffix}`,
    updatedAt,
  };
}

async function setupCase(params: {
  prefix: string;
  store: Record<string, StoreEntryFixture>;
  targetAgentId: string;
}): Promise<{ stateDir: string; targetStorePath: string; restore: () => void }> {
  const stateDir = await createStateDir(params.prefix);
  snapshotEnv(["REMOTECLAW_STATE_DIR", "REMOTECLAW_TEST_FAST"]);
  process.env.REMOTECLAW_STATE_DIR = stateDir;
  process.env.REMOTECLAW_TEST_FAST = "1";
  const targetStorePath = path.join(
    stateDir,
    "agents",
    params.targetAgentId,
    "sessions",
    "sessions.json",
  );
  await writeSessionStore(targetStorePath, params.store);
  return { stateDir, targetStorePath, restore: restoreEnv };
}

// ─── Suite ───────────────────────────────────────────────────────────────

describe("migrateOrphanedMainSessionKeys", () => {
  beforeAll(async () => {
    fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), "remoteclaw-orphaned-main-keys-"));
  });

  afterAll(async () => {
    await fs.rm(fixtureRoot, { recursive: true, force: true });
    fixtureRoot = "";
    caseCounter = 0;
  });

  afterEach(() => {
    restoreEnv();
  });

  // ── Scenario A: sole agent with id ≠ "main" ──────────────────────────

  describe("Scenario A (sole agent with id ≠ main)", () => {
    it("rewrites agent:main:* keys to agent:{soleAgentId}:* and reports changes", async () => {
      const store: Record<string, StoreEntryFixture> = {
        "agent:main:telegram:direct:12345": makeEntry(1_000, "-a"),
        "agent:main:main": makeEntry(2_000, "-b"),
        "agent:main:whatsapp:group:abc@g.us": makeEntry(3_000, "-c"),
      };
      const ctx = await setupCase({
        prefix: "scenario-a",
        store,
        targetAgentId: "assistant",
      });

      const cfg = buildConfig(["assistant"]);
      const detected = await detectLegacyStateMigrations({ cfg });
      expect(detected.orphanedMainKeys.scenario).toBe("A");
      expect(detected.orphanedMainKeys.keys).toHaveLength(3);
      expect(detected.orphanedMainKeys.soleAgentId).toBe("assistant");
      expect(detected.preview.some((line) => line.includes("rewrite 3"))).toBe(true);

      const result = await runLegacyStateMigrations({ detected });
      expect(result.warnings).toEqual([]);
      expect(
        result.changes.some((line) =>
          line.includes("Rewrote 3 agent:main:* session key(s) → agent:assistant:*"),
        ),
      ).toBe(true);

      const rewritten = await readSessionStoreDirect(ctx.targetStorePath);
      expect(Object.keys(rewritten).toSorted()).toEqual([
        "agent:assistant:main",
        "agent:assistant:telegram:direct:12345",
        "agent:assistant:whatsapp:group:abc@g.us",
      ]);
      expect(rewritten["agent:assistant:main"]?.sessionId).toBe("session-2000-b");
      expect(rewritten["agent:assistant:telegram:direct:12345"]?.sessionId).toBe("session-1000-a");
    });

    it("preserves non-agent:main:* keys unchanged", async () => {
      const store: Record<string, StoreEntryFixture> = {
        "agent:main:telegram:direct:1": makeEntry(1_000),
        "agent:assistant:discord:direct:2": makeEntry(2_000),
        global: makeEntry(3_000),
      };
      const ctx = await setupCase({
        prefix: "scenario-a-preserve",
        store,
        targetAgentId: "assistant",
      });

      const cfg = buildConfig(["assistant"]);
      const detected = await detectLegacyStateMigrations({ cfg });
      await runLegacyStateMigrations({ detected });

      const rewritten = await readSessionStoreDirect(ctx.targetStorePath);
      expect(rewritten["agent:assistant:telegram:direct:1"]).toBeDefined();
      expect(rewritten["agent:assistant:discord:direct:2"]).toBeDefined();
      expect(rewritten.global).toBeDefined();
      expect(rewritten["agent:main:telegram:direct:1"]).toBeUndefined();
    });

    it("resolves collisions by picking the newer entry by updatedAt", async () => {
      const store: Record<string, StoreEntryFixture> = {
        "agent:main:telegram:direct:shared": makeEntry(5_000, "-old"),
        "agent:assistant:telegram:direct:shared": makeEntry(10_000, "-new"),
      };
      const ctx = await setupCase({
        prefix: "scenario-a-collision-new-wins",
        store,
        targetAgentId: "assistant",
      });

      const cfg = buildConfig(["assistant"]);
      const detected = await detectLegacyStateMigrations({ cfg });
      const result = await runLegacyStateMigrations({ detected });

      expect(result.changes.some((line) => line.includes("Resolved 1 session key collision"))).toBe(
        true,
      );

      const rewritten = await readSessionStoreDirect(ctx.targetStorePath);
      expect(rewritten["agent:assistant:telegram:direct:shared"]?.sessionId).toBe(
        "session-10000-new",
      );
    });

    it("resolves collisions by picking the older existing when orphan is older", async () => {
      const store: Record<string, StoreEntryFixture> = {
        "agent:main:telegram:direct:shared": makeEntry(2_000, "-older"),
        "agent:assistant:telegram:direct:shared": makeEntry(1_000, "-existing-oldest"),
      };
      const ctx = await setupCase({
        prefix: "scenario-a-collision-orphan-wins",
        store,
        targetAgentId: "assistant",
      });

      const cfg = buildConfig(["assistant"]);
      const detected = await detectLegacyStateMigrations({ cfg });
      await runLegacyStateMigrations({ detected });

      const rewritten = await readSessionStoreDirect(ctx.targetStorePath);
      // Older orphan (2_000) wins over even-older existing (1_000) since it's newer by updatedAt.
      expect(rewritten["agent:assistant:telegram:direct:shared"]?.sessionId).toBe(
        "session-2000-older",
      );
    });

    it("is idempotent — a second run reports no orphan-key changes", async () => {
      const store: Record<string, StoreEntryFixture> = {
        "agent:main:telegram:direct:42": makeEntry(1_000),
      };
      await setupCase({
        prefix: "scenario-a-idempotent",
        store,
        targetAgentId: "assistant",
      });

      const cfg = buildConfig(["assistant"]);
      const first = await detectLegacyStateMigrations({ cfg });
      await runLegacyStateMigrations({ detected: first });

      const second = await detectLegacyStateMigrations({ cfg });
      expect(second.orphanedMainKeys.scenario).toBe("none");
      expect(second.orphanedMainKeys.keys).toEqual([]);
      const result = await runLegacyStateMigrations({ detected: second });
      expect(result.changes.filter((line) => line.includes("agent:main:")).length).toBe(0);
      expect(result.warnings).toEqual([]);
    });
  });

  // ── Scenario B: sole agent with id = "main" ──────────────────────────

  describe('Scenario B (sole agent with id = "main")', () => {
    it("does not rewrite keys and logs a brief info message", async () => {
      const store: Record<string, StoreEntryFixture> = {
        "agent:main:telegram:direct:42": makeEntry(1_000),
        "agent:main:main": makeEntry(2_000),
      };
      const ctx = await setupCase({
        prefix: "scenario-b",
        store,
        targetAgentId: "main",
      });

      const cfg = buildConfig(["main"]);
      const detected = await detectLegacyStateMigrations({ cfg });
      expect(detected.orphanedMainKeys.scenario).toBe("B");
      expect(detected.orphanedMainKeys.keys).toHaveLength(2);
      // Scenario B does NOT add a preview line (no migration needed).
      expect(detected.preview.some((line) => line.includes("orphaned agent:main:*"))).toBe(false);

      const result = await runLegacyStateMigrations({ detected });
      expect(result.warnings).toEqual([]);
      expect(
        result.changes.some((line) =>
          line.includes("No agent:main:* session key migration needed"),
        ),
      ).toBe(true);

      // Store unchanged.
      const after = await readSessionStoreDirect(ctx.targetStorePath);
      expect(Object.keys(after).toSorted()).toEqual([
        "agent:main:main",
        "agent:main:telegram:direct:42",
      ]);
    });
  });

  // ── Scenario C: multi-agent configured ───────────────────────────────

  describe("Scenario C (multi-agent configured)", () => {
    it("does not rewrite and emits a WARN with manual resolution instructions", async () => {
      const store: Record<string, StoreEntryFixture> = {
        "agent:main:telegram:direct:42": makeEntry(1_000),
        "agent:main:whatsapp:group:xyz@g.us": makeEntry(2_000),
      };
      // Target agent is first-listed when no sole agent: "alpha"
      const ctx = await setupCase({
        prefix: "scenario-c",
        store,
        targetAgentId: "alpha",
      });

      const cfg = buildConfig(["alpha", "beta"]);
      const detected = await detectLegacyStateMigrations({ cfg });
      expect(detected.orphanedMainKeys.scenario).toBe("C");
      expect(detected.orphanedMainKeys.keys).toHaveLength(2);
      expect(detected.orphanedMainKeys.configuredAgentIds).toEqual(["alpha", "beta"]);
      expect(
        detected.preview.some((line) =>
          line.includes("multi-agent config, manual resolution required"),
        ),
      ).toBe(true);

      const result = await runLegacyStateMigrations({ detected });
      expect(result.warnings).toHaveLength(1);
      const warning = result.warnings[0] ?? "";
      expect(warning).toContain("Found 2 orphaned agent:main:* session key(s)");
      expect(warning).toContain("Configured agents: alpha, beta");
      expect(warning).toContain("Reconfigure with a single agent temporarily");

      // Keys left in place — non-destructive.
      const after = await readSessionStoreDirect(ctx.targetStorePath);
      expect(after["agent:main:telegram:direct:42"]).toBeDefined();
      expect(after["agent:main:whatsapp:group:xyz@g.us"]).toBeDefined();
    });

    it("is idempotent on re-run (same WARN, no rewrite)", async () => {
      const store: Record<string, StoreEntryFixture> = {
        "agent:main:telegram:direct:42": makeEntry(1_000),
      };
      await setupCase({
        prefix: "scenario-c-idempotent",
        store,
        targetAgentId: "alpha",
      });

      const cfg = buildConfig(["alpha", "beta"]);
      const first = await detectLegacyStateMigrations({ cfg });
      await runLegacyStateMigrations({ detected: first });

      const second = await detectLegacyStateMigrations({ cfg });
      expect(second.orphanedMainKeys.scenario).toBe("C");
      const result = await runLegacyStateMigrations({ detected: second });
      expect(result.warnings).toHaveLength(1);
    });
  });

  // ── No orphans ───────────────────────────────────────────────────────

  describe("no orphans present", () => {
    it('classifies as scenario "none" and records no changes', async () => {
      const store: Record<string, StoreEntryFixture> = {
        "agent:assistant:main": makeEntry(1_000),
      };
      await setupCase({
        prefix: "no-orphans",
        store,
        targetAgentId: "assistant",
      });

      const cfg = buildConfig(["assistant"]);
      const detected = await detectLegacyStateMigrations({ cfg });
      expect(detected.orphanedMainKeys.scenario).toBe("none");
      expect(detected.orphanedMainKeys.keys).toEqual([]);

      const result = await runLegacyStateMigrations({ detected });
      expect(
        result.changes.filter((line) => line.toLowerCase().includes("agent:main")).length,
      ).toBe(0);
      expect(result.warnings).toEqual([]);
    });
  });
});
