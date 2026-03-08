import { buildAuthHealthSummary } from "../auth/auth-health.js";
import {
  CLAUDE_CLI_PROFILE_ID,
  CODEX_CLI_PROFILE_ID,
  ensureAuthProfileStore,
} from "../auth/index.js";
import { updateAuthProfileStoreWithLock } from "../auth/store.js";
import { formatCliCommand } from "../cli/command-format.js";
import type { RemoteClawConfig } from "../config/config.js";
import { note } from "../terminal/note.js";
import type { DoctorPrompter } from "./doctor-prompter.js";

export async function maybeRepairAnthropicOAuthProfileId(
  _cfg: RemoteClawConfig,
  _prompter: DoctorPrompter,
): Promise<RemoteClawConfig> {
  // OAuth profile repair removed — only API keys are supported now.
  return _cfg;
}

function pruneAuthProfiles(
  cfg: RemoteClawConfig,
  profileIds: Set<string>,
): { next: RemoteClawConfig; changed: boolean } {
  const profiles = cfg.auth?.profiles;
  const nextProfiles = profiles ? { ...profiles } : undefined;
  let changed = false;

  if (nextProfiles) {
    for (const id of profileIds) {
      if (id in nextProfiles) {
        delete nextProfiles[id];
        changed = true;
      }
    }
  }

  if (!changed) {
    return { next: cfg, changed: false };
  }

  const nextAuth = nextProfiles
    ? {
        ...cfg.auth,
        profiles: Object.keys(nextProfiles).length > 0 ? nextProfiles : undefined,
      }
    : undefined;

  return {
    next: {
      ...cfg,
      auth: nextAuth,
    },
    changed: true,
  };
}

export async function maybeRemoveDeprecatedCliAuthProfiles(
  cfg: RemoteClawConfig,
  prompter: DoctorPrompter,
): Promise<RemoteClawConfig> {
  const store = ensureAuthProfileStore(undefined, { allowKeychainPrompt: false });
  const deprecated = new Set<string>();
  if (store.profiles[CLAUDE_CLI_PROFILE_ID] || cfg.auth?.profiles?.[CLAUDE_CLI_PROFILE_ID]) {
    deprecated.add(CLAUDE_CLI_PROFILE_ID);
  }
  if (store.profiles[CODEX_CLI_PROFILE_ID] || cfg.auth?.profiles?.[CODEX_CLI_PROFILE_ID]) {
    deprecated.add(CODEX_CLI_PROFILE_ID);
  }

  if (deprecated.size === 0) {
    return cfg;
  }

  const lines = ["Deprecated external CLI auth profiles detected (no longer supported):"];
  if (deprecated.has(CLAUDE_CLI_PROFILE_ID)) {
    lines.push(
      `- ${CLAUDE_CLI_PROFILE_ID} (Anthropic): use ${formatCliCommand("remoteclaw configure")}`,
    );
  }
  if (deprecated.has(CODEX_CLI_PROFILE_ID)) {
    lines.push(
      `- ${CODEX_CLI_PROFILE_ID} (OpenAI Codex): use ${formatCliCommand("remoteclaw configure")}`,
    );
  }
  note(lines.join("\n"), "Auth profiles");

  const shouldRemove = await prompter.confirmRepair({
    message: "Remove deprecated CLI auth profiles now?",
    initialValue: true,
  });
  if (!shouldRemove) {
    return cfg;
  }

  await updateAuthProfileStoreWithLock({
    updater: (nextStore) => {
      let mutated = false;
      for (const id of deprecated) {
        if (nextStore.profiles[id]) {
          delete nextStore.profiles[id];
          mutated = true;
        }
      }
      return mutated;
    },
  });

  const pruned = pruneAuthProfiles(cfg, deprecated);
  if (pruned.changed) {
    note(
      Array.from(deprecated.values())
        .map((id) => `- removed ${id} from config`)
        .join("\n"),
      "Doctor changes",
    );
  }
  return pruned.next;
}

type AuthIssue = {
  profileId: string;
  provider: string;
  status: string;
};

function formatAuthIssueHint(issue: AuthIssue): string | null {
  if (issue.provider === "anthropic" && issue.profileId === CLAUDE_CLI_PROFILE_ID) {
    return `Deprecated profile. Use ${formatCliCommand("remoteclaw configure")}.`;
  }
  if (issue.provider === "openai-codex" && issue.profileId === CODEX_CLI_PROFILE_ID) {
    return `Deprecated profile. Use ${formatCliCommand("remoteclaw configure")}.`;
  }
  return `Re-auth via \`${formatCliCommand("remoteclaw configure")}\` or \`${formatCliCommand("remoteclaw onboard")}\`.`;
}

function formatAuthIssueLine(issue: AuthIssue): string {
  const hint = formatAuthIssueHint(issue);
  return `- ${issue.profileId}: ${issue.status}${hint ? ` — ${hint}` : ""}`;
}

export async function noteAuthProfileHealth(params: {
  cfg: RemoteClawConfig;
  prompter: DoctorPrompter;
  allowKeychainPrompt: boolean;
}): Promise<void> {
  const store = ensureAuthProfileStore(undefined, {
    allowKeychainPrompt: params.allowKeychainPrompt,
  });

  const summary = buildAuthHealthSummary({
    store,
    cfg: params.cfg,
  });

  const issues = summary.profiles.filter((profile) => profile.status === "missing");

  if (issues.length === 0) {
    return;
  }

  note(
    issues
      .map((issue) =>
        formatAuthIssueLine({
          profileId: issue.profileId,
          provider: issue.provider,
          status: issue.status,
        }),
      )
      .join("\n"),
    "Model auth",
  );
}
