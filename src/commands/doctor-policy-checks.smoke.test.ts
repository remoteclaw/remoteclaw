import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  POLICY_CHECK_IDS,
  registerPolicyDoctorChecks,
  resetPolicyDoctorChecksForTest,
} from "../../extensions/policy/src/doctor/register.js";
import type { RemoteClawConfig } from "../config/config.js";
import {
  clearHealthChecksForTest,
  listHealthChecks,
  registerBundledHealthCheck,
} from "../plugin-sdk/_health/health-check-registry.js";
import type { RuntimeEnv } from "../runtime.js";
import { runPolicyDoctorChecks } from "./doctor-policy-checks.js";

// A doctor runtime that swallows all output — these tests assert on the returned
// config, not on console side-effects.
const runtime: RuntimeEnv = {
  log() {},
  error() {},
  exit() {},
};

let workspaceDir: string;

// The denied-channel check reads `<cwd>/policy.jsonc` (JSON5). `runPolicyDoctorChecks`
// derives `cwd` from `agents.defaults.workspace`, so every fixture points the default
// agent workspace at the temp dir where we write the policy artifact.
function cfgWithPolicy(
  policyConfig: Record<string, unknown>,
  extra: Partial<RemoteClawConfig> = {},
): RemoteClawConfig {
  return {
    agents: { defaults: { workspace: workspaceDir } },
    plugins: {
      entries: {
        policy: { enabled: true, config: { enabled: true, ...policyConfig } },
      },
    },
    ...extra,
  } as RemoteClawConfig;
}

// Writes the config file (read by evidence collection) plus a policy.jsonc that
// denies the Telegram provider — the single repairable finding class.
async function writeTelegramDenyPolicy(): Promise<string> {
  const configPath = join(workspaceDir, "remoteclaw.jsonc");
  await fs.writeFile(configPath, "{}", "utf-8");
  await fs.writeFile(
    join(workspaceDir, "policy.jsonc"),
    JSON.stringify(
      { channels: { denyRules: [{ id: "no-telegram", when: { provider: "telegram" } }] } },
      null,
      2,
    ),
    "utf-8",
  );
  return configPath;
}

describe("runPolicyDoctorChecks", () => {
  beforeEach(async () => {
    clearHealthChecksForTest();
    resetPolicyDoctorChecksForTest();
    workspaceDir = await fs.mkdtemp(join(tmpdir(), "policy-doctor-smoke-"));
  });

  afterEach(async () => {
    clearHealthChecksForTest();
    resetPolicyDoctorChecksForTest();
    await fs.rm(workspaceDir, { recursive: true, force: true });
  });

  // These tests register the policy checks through a BUNDLED-origin host
  // (`registerBundledHealthCheck`) — the same marking the framework applies in
  // production via `api.registerHealthCheck` for the bundled `policy` ext (#2896).
  // Without the bundled marker, the `--fix` reducer drops the repair (see test iv).
  //
  // (i) Module-singleton: the core doctor reads the very same registry Map the ext
  // registers into. If that import resolved to a different module instance, this
  // list would be empty.
  it("registers policy checks into the registry the core doctor reads", () => {
    expect(listHealthChecks()).toHaveLength(0);
    registerPolicyDoctorChecks({ registerHealthCheck: registerBundledHealthCheck });
    const ids = listHealthChecks().map((check) => check.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids)).toEqual(new Set(POLICY_CHECK_IDS));
  });

  // (ii) Detect is pure-read: without `--fix`, a denied channel is surfaced but the
  // config is returned untouched (same reference).
  it("leaves config untouched without --fix even when a channel is denied", async () => {
    const configPath = await writeTelegramDenyPolicy();
    registerPolicyDoctorChecks({ registerHealthCheck: registerBundledHealthCheck });
    const cfg = cfgWithPolicy(
      { workspaceRepairs: true },
      { channels: { telegram: { enabled: true } } },
    );

    const result = await runPolicyDoctorChecks({
      runtime,
      cfg,
      configPath,
      prompter: { shouldRepair: false },
    });

    expect(result).toBe(cfg);
    expect(result.channels?.telegram).toEqual({ enabled: true });
  });

  // (iii) Dual gate: `--fix` alone is not enough. With the plugin's own
  // `workspaceRepairs` opt-in OFF, the repair self-skips and nothing changes.
  it("does not repair under --fix when workspaceRepairs is off", async () => {
    const configPath = await writeTelegramDenyPolicy();
    registerPolicyDoctorChecks({ registerHealthCheck: registerBundledHealthCheck });
    const cfg = cfgWithPolicy(
      { workspaceRepairs: false },
      { channels: { telegram: { enabled: true } } },
    );

    const result = await runPolicyDoctorChecks({
      runtime,
      cfg,
      configPath,
      prompter: { shouldRepair: true },
    });

    expect(result.channels?.telegram).toEqual({ enabled: true });
    expect(result.agents).toEqual(cfg.agents);
    expect(result.plugins).toEqual(cfg.plugins);
  });

  // (iv) Both gates on: the bounded repair disables ONLY the denied channel's
  // `enabled` flag; agents/plugins and every other channel field are left intact.
  it("under --fix + workspaceRepairs disables only the denied channel", async () => {
    const configPath = await writeTelegramDenyPolicy();
    registerPolicyDoctorChecks({ registerHealthCheck: registerBundledHealthCheck });
    const cfg = cfgWithPolicy(
      { workspaceRepairs: true },
      { channels: { telegram: { enabled: true }, discord: { enabled: true } } },
    );

    const result = await runPolicyDoctorChecks({
      runtime,
      cfg,
      configPath,
      prompter: { shouldRepair: true },
    });

    expect(result.channels?.telegram).toEqual({ enabled: false });
    // Non-denied channel is never touched; only `enabled` on the denied one flips.
    expect(result.channels?.discord).toEqual({ enabled: true });
    expect(result.agents).toEqual(cfg.agents);
    expect(result.plugins).toEqual(cfg.plugins);
  });
});
