// Compact built-in summaries shown in tool inventories and model-facing tool
// descriptions when a longer contextual description is assembled elsewhere.

/**
 * Runtime attestation (ADR 0005 H9). Declares the implementation status
 * of each runtime export in this module. See CONTRIBUTING.md § Module
 * attestations for the category definitions and the convention for
 * updating these when sync or rebrand changes the surface.
 */
export const MODULE_ATTESTATIONS = {
  describeSessionsListTool: "live",
  describeSessionsHistoryTool: "live",
  describeSessionsSendTool: "live",
  describeSessionsSpawnTool: "live",
  describeSessionStatusTool: "live",
  describeUpdatePlanTool: "live",
} as const;
export const EXEC_TOOL_DISPLAY_SUMMARY = "Run shell now.";
export const PROCESS_TOOL_DISPLAY_SUMMARY = "Inspect/control exec sessions.";
export const CRON_TOOL_DISPLAY_SUMMARY = "Schedule reminders, cron, wake events.";
export const SESSIONS_LIST_TOOL_DISPLAY_SUMMARY = "List visible sessions; filters/previews.";
export const SESSIONS_HISTORY_TOOL_DISPLAY_SUMMARY = "Read sanitized session history.";
export const SESSIONS_SEND_TOOL_DISPLAY_SUMMARY = "Message session or configured agent.";
export const SESSIONS_SPAWN_TOOL_DISPLAY_SUMMARY = "Spawn subagent or ACP session.";
export const SESSIONS_SPAWN_SUBAGENT_TOOL_DISPLAY_SUMMARY = "Spawn subagent session.";
export const SESSION_STATUS_TOOL_DISPLAY_SUMMARY = "Show session status/model/usage.";
export const UPDATE_PLAN_TOOL_DISPLAY_SUMMARY = "Track short work plan.";

/** Describes the sessions_list tool for model-facing instructions. */
export function describeSessionsListTool(): string {
  return [
    "List visible sessions with optional filters for kind, label, agentId, search, recent activity, derived titles, and last-message previews.",
    "Use this to discover a target session before calling sessions_history or sessions_send.",
  ].join(" ");
}

/** Describes the sessions_history tool for model-facing instructions. */
export function describeSessionsHistoryTool(): string {
  return [
    "Fetch sanitized message history for a visible session.",
    "Supports limits and optional tool messages; use this to inspect another session before replying, debugging, or resuming work.",
  ].join(" ");
}

/** Describes the sessions_send tool for model-facing instructions. */
export function describeSessionsSendTool(): string {
  return [
    "Send a message into another visible session by sessionKey or label.",
    "Thread-scoped chat sessions are rejected; target the parent channel session for inter-agent coordination.",
    "Use this to delegate follow-up work to an existing session; waits for the target run and returns the updated assistant reply when available.",
  ].join(" ");
}

/** Describes the sessions_spawn tool for model-facing instructions. */
export function describeSessionsSpawnTool(options?: {
  acpAvailable?: boolean;
  threadAvailable?: boolean;
}): string {
  const baseDescription = [
    'Spawn a clean isolated session by default with `runtime="subagent"` or `runtime="acp"`.',
    options?.threadAvailable
      ? '`mode="run"` is one-shot and `mode="session"` is persistent and thread-bound.'
      : '`mode="run"` is one-shot background work.',
    "Subagents inherit the parent workspace directory automatically.",
    'For native subagents only, set `context="fork"` when the child needs the current transcript context; otherwise omit it or use `context="isolated"`.',
    "Use this when the work should happen in a fresh child session instead of the current one.",
  ];
  if (options?.acpAvailable === false) {
    return baseDescription
      .map((line) =>
        line.replace(
          ' with `runtime="subagent"` or `runtime="acp"`',
          " with the native subagent runtime",
        ),
      )
      .join(" ");
  }
  return [
    ...baseDescription.slice(0, 3),
    '`runtime="acp"` is for external ACP harness ids such as codex, claude, gemini, or opencode, or agents configured with `agents.list[].runtime.type="acp"`.',
    ...baseDescription.slice(3),
  ].join(" ");
}

/** Describes the session_status tool for model-facing instructions. */
export function describeSessionStatusTool(): string {
  return [
    "Show a /status-equivalent session status card for the current or another visible session, including usage, time, cost when available, and linked background task context.",
    'Use `sessionKey="current"` for the current session; do not use UI/client labels such as `remoteclaw-tui` as session keys.',
    "Optional `model` sets a per-session model override; `model=default` resets overrides.",
    "Use this for questions like what model is active or how a session is configured.",
  ].join(" ");
}

/** Describes the update_plan tool for model-facing instructions. */
export function describeUpdatePlanTool(): string {
  return [
    "Update the current structured work plan for this run.",
    "Use this for non-trivial multi-step work so the plan stays current while execution continues.",
    "Keep steps short, mark at most one step as `in_progress`, and skip this tool for simple one-step tasks.",
  ].join(" ");
}
