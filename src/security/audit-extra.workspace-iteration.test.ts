import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RemoteClawConfig } from "../config/config.js";
import { collectWorkspaceSkillSymlinkEscapeFindings } from "./audit-extra.async.js";

// Regression coverage for #2310 (Wave 3/6 — "eliminate default agent" initiative).
//
// Pre-#2310, `src/security/audit-extra.async.ts`'s internal
// `listAgentWorkspaceDirs` helper called `resolveDefaultAgentId(cfg)` which
// produced `"main"` for empty configs and for configs without a `"main"`
// agent. The security audit would then attempt to include a phantom `"main"`
// workspace that didn't exist in the user's configuration.
//
// Post-#2310, `listAgentWorkspaceDirs` uses `resolveFirstAgentWorkspace(cfg)`
// which returns the first actually-configured agent's workspace (respecting
// declaration order and `agents.defaults.workspace`) and returns `null` for
// empty configs instead of fabricating a `"main"` entry.
//
// These tests pin the observable consequences of that migration:
//
//   - A multi-agent config without a `"main"` entry scans every configured
//     agent's workspace. The audit never touches a phantom `"main"` dir.
//   - A sole-agent config named `"solo"` (not `"main"`) scans the solo
//     workspace without crashing.
//   - An empty `agents.list` scans zero workspaces. If a future refactor
//     re-introduces a `"main"` fallback, this test would fail because the
//     phantom workspace would be scanned and its symlink escape would be
//     reported.
//
// Fixtures use explicit agent IDs (`alpha`, `beta`, `solo`) and never
// `"main"`, so a regression that re-added a `"main"` fallback would not be
// masked by the fixture name.

// Canonical escape target used by the symlink-escape fixtures. This path is
// outside every workspace we create, so pointing a skill file at it via a
// symlink constitutes an "escape".
let escapeTargetDir: string;
let tmpRoot: string;

async function createWorkspaceWithEscape(workspaceRoot: string, agentId: string): Promise<string> {
  const workspaceDir = path.join(workspaceRoot, agentId);
  const skillDir = path.join(workspaceDir, "skills", "escape-probe");
  await fs.mkdir(skillDir, { recursive: true });
  const skillLink = path.join(skillDir, "SKILL.md");
  // Create a real file in the escape target, then symlink the in-workspace
  // SKILL.md to it. This triggers the symlink-escape detection.
  const escapeFile = path.join(escapeTargetDir, `${agentId}-escaped-skill.md`);
  await fs.writeFile(escapeFile, "---\nname: escaped\n---\nescaped skill body", "utf-8");
  await fs.symlink(escapeFile, skillLink);
  return workspaceDir;
}

async function createWorkspaceWithoutEscape(
  workspaceRoot: string,
  agentId: string,
): Promise<string> {
  const workspaceDir = path.join(workspaceRoot, agentId);
  await fs.mkdir(workspaceDir, { recursive: true });
  return workspaceDir;
}

beforeEach(async () => {
  const projectTmp = path.join(process.cwd(), ".tmp");
  await fs.mkdir(projectTmp, { recursive: true });
  tmpRoot = await fs.mkdtemp(path.join(projectTmp, "audit-workspace-iteration-"));
  escapeTargetDir = path.join(tmpRoot, "__escape_target__");
  await fs.mkdir(escapeTargetDir, { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

describe("collectWorkspaceSkillSymlinkEscapeFindings (regression: #2310)", () => {
  it("iterates every configured agent workspace in a multi-agent config without a 'main' entry", async () => {
    const alphaWorkspace = await createWorkspaceWithEscape(tmpRoot, "alpha");
    const betaWorkspace = await createWorkspaceWithEscape(tmpRoot, "beta");

    const cfg: RemoteClawConfig = {
      agents: {
        list: [
          { id: "alpha", workspace: alphaWorkspace },
          { id: "beta", workspace: betaWorkspace },
        ],
      },
    };

    const findings = await collectWorkspaceSkillSymlinkEscapeFindings({ cfg });

    expect(findings).toHaveLength(1);
    const [finding] = findings;
    expect(finding?.checkId).toBe("skills.workspace.symlink_escape");
    // Both agent workspaces must appear in the finding's detail — proves the
    // audit iterated BOTH alpha and beta, not just a phantom "main".
    expect(finding?.detail).toContain(alphaWorkspace);
    expect(finding?.detail).toContain(betaWorkspace);
    // No phantom "main" workspace should appear in the detail. The fixture
    // never configured an agent named "main"; if the detail mentions "main",
    // a fallback reintroduced the phantom.
    expect(finding?.detail).not.toMatch(/\bmain\b/);
  });

  it("scans the sole agent workspace by its explicit ID (not 'main')", async () => {
    const soloWorkspace = await createWorkspaceWithEscape(tmpRoot, "solo");

    const cfg: RemoteClawConfig = {
      agents: { list: [{ id: "solo", workspace: soloWorkspace }] },
    };

    const findings = await collectWorkspaceSkillSymlinkEscapeFindings({ cfg });

    expect(findings).toHaveLength(1);
    expect(findings[0]?.detail).toContain(soloWorkspace);
    expect(findings[0]?.detail).not.toMatch(/\bmain\b/);
  });

  it("does not crash when no agent is named 'main' in a multi-agent config", async () => {
    // Clean workspaces (no escapes). The point is: the audit must not throw
    // when there's no "main" entry to look up. Pre-#2310 the internal
    // `listAgentWorkspaceDirs` called `resolveAgentWorkspaceDir(cfg, "main")`
    // variants that could crash; post-#2310 it uses
    // `resolveFirstAgentWorkspace` which gracefully returns the first agent.
    const alphaWorkspace = await createWorkspaceWithoutEscape(tmpRoot, "alpha");
    const betaWorkspace = await createWorkspaceWithoutEscape(tmpRoot, "beta");

    const cfg: RemoteClawConfig = {
      agents: {
        list: [
          { id: "alpha", workspace: alphaWorkspace },
          { id: "beta", workspace: betaWorkspace },
        ],
      },
    };

    const findings = await collectWorkspaceSkillSymlinkEscapeFindings({ cfg });
    expect(findings).toEqual([]);
  });

  it("scans zero workspaces for an empty agents.list (no phantom main workspace)", async () => {
    // Create a workspace at tmpRoot/main with an escaped skill. If the audit
    // reintroduces a "main" fallback, it will crash or report this workspace;
    // a correctly migrated audit returns zero findings because agents.list
    // is empty.
    await createWorkspaceWithEscape(tmpRoot, "main");

    const cfg: RemoteClawConfig = { agents: { list: [] } };

    const findings = await collectWorkspaceSkillSymlinkEscapeFindings({ cfg });
    expect(findings).toEqual([]);
  });

  it("scans zero workspaces for entirely missing agents config", async () => {
    // Same sentinel: a workspace at tmpRoot/main that a regressed audit
    // would discover and scan. An empty config must not fabricate a "main"
    // workspace path.
    await createWorkspaceWithEscape(tmpRoot, "main");

    const cfg: RemoteClawConfig = {};

    const findings = await collectWorkspaceSkillSymlinkEscapeFindings({ cfg });
    expect(findings).toEqual([]);
  });
});
