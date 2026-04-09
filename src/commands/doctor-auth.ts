import { buildAuthHealthSummary } from "../auth/auth-health.js";
import { ensureAuthProfileStore } from "../auth/index.js";
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

type AuthIssue = {
  profileId: string;
  provider: string;
  status: string;
};

export function resolveUnusableProfileHint(params: {
  kind: "cooldown" | "disabled";
  reason?: string;
}): string {
  if (params.kind === "disabled") {
    if (params.reason === "billing") {
      return "Top up credits (provider billing) or switch provider.";
    }
    if (params.reason === "auth_permanent" || params.reason === "auth") {
      return "Refresh or replace credentials, then retry.";
    }
  }
  return "Wait for cooldown or switch provider.";
}

function formatAuthIssueHint(_issue: AuthIssue): string {
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
  const store = ensureAuthProfileStore();

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

// Gutted in RemoteClaw fork (Middleware Boundary Principle) - upstream function stub
export async function maybeRemoveDeprecatedCliAuthProfiles(
  cfg: RemoteClawConfig,
  ..._args: unknown[]
): Promise<RemoteClawConfig> {
  // No-op in RemoteClaw fork
  return cfg;
}
