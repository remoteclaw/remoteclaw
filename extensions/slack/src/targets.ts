import {
  buildMessagingTarget,
  ensureTargetId,
  parseMentionPrefixOrAtUserTarget,
  requireTargetKind,
  type MessagingTarget,
  type MessagingTargetKind,
  type MessagingTargetParseOptions,
} from "../../../src/channels/targets.js";

export type SlackTargetKind = MessagingTargetKind;

export type SlackTarget = MessagingTarget;

type SlackTargetParseOptions = MessagingTargetParseOptions;

// Slack object-id leading characters: user-like ids start with U (member),
// W (Enterprise Grid member) or B (bot); channel-like ids start with C (public
// channel), G (private channel/group) or D (DM). https://api.slack.com/methods/conversations.info
const SLACK_USER_ID_PREFIXES = "UWB";
const SLACK_CHANNEL_ID_PREFIXES = "CGD";
const SLACK_ID_KIND_LABELS: Record<string, string> = {
  U: "user",
  W: "user",
  B: "bot user",
  C: "public channel",
  G: "private channel",
  D: "DM channel",
};

// Explicit kind-declaring target syntaxes: `user:`/`channel:` prefixes, the legacy
// `slack:` user alias, and the `#` channel sigil. A bare id, `<@mention>` or `@user`
// carries no user-chosen kind declaration and is left lenient.
const SLACK_KIND_DECLARING_PREFIXES = ["user:", "channel:", "slack:"] as const;

// Reject a target whose explicit kind declaration contradicts the Slack id's leading
// character — e.g. `user:D…` (a DM channel id) or `channel:U…` (a user id). These parse
// "successfully" today but fail silently at delivery time, so surface a clear error
// pointing at the correct prefix instead of misconfiguring the target.
function validateSlackIdKind(declaredKind: SlackTargetKind, id: string, declaredAs: string): void {
  const firstChar = id.charAt(0).toUpperCase();
  const actualKind: SlackTargetKind | undefined = SLACK_USER_ID_PREFIXES.includes(firstChar)
    ? "user"
    : SLACK_CHANNEL_ID_PREFIXES.includes(firstChar)
      ? "channel"
      : undefined;
  if (!actualKind || actualKind === declaredKind) {
    return;
  }
  const label = SLACK_ID_KIND_LABELS[firstChar] ?? actualKind;
  throw new Error(
    `Slack ID "${id}" looks like a ${label} (${firstChar}-prefix), ` +
      `but was specified as ${declaredAs}. Use ${actualKind}:${id} instead.`,
  );
}

export function parseSlackTarget(
  raw: string,
  options: SlackTargetParseOptions = {},
): SlackTarget | undefined {
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }
  const userTarget = parseMentionPrefixOrAtUserTarget({
    raw: trimmed,
    mentionPattern: /^<@([A-Z0-9]+)>$/i,
    prefixes: [
      { prefix: "user:", kind: "user" },
      { prefix: "channel:", kind: "channel" },
      { prefix: "slack:", kind: "user" },
    ],
    atUserPattern: /^[A-Z0-9]+$/i,
    atUserErrorMessage: "Slack DMs require a user id (use user:<id> or <@id>)",
  });
  if (userTarget) {
    const declaredAs = SLACK_KIND_DECLARING_PREFIXES.find((prefix) => trimmed.startsWith(prefix));
    if (declaredAs) {
      validateSlackIdKind(userTarget.kind, userTarget.id, declaredAs);
    }
    return userTarget;
  }
  if (trimmed.startsWith("#")) {
    const candidate = trimmed.slice(1).trim();
    const id = ensureTargetId({
      candidate,
      pattern: /^[A-Z0-9]+$/i,
      errorMessage: "Slack channels require a channel id (use channel:<id>)",
    });
    validateSlackIdKind("channel", id, "#");
    return buildMessagingTarget("channel", id, trimmed);
  }
  if (options.defaultKind) {
    return buildMessagingTarget(options.defaultKind, trimmed, trimmed);
  }
  return buildMessagingTarget("channel", trimmed, trimmed);
}

export function resolveSlackChannelId(raw: string): string {
  const target = parseSlackTarget(raw, { defaultKind: "channel" });
  return requireTargetKind({ platform: "Slack", target, kind: "channel" });
}

export function normalizeSlackMessagingTarget(raw: string): string | undefined {
  return parseSlackTarget(raw, { defaultKind: "channel" })?.normalized;
}

export function looksLikeSlackTargetId(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) {
    return false;
  }
  if (/^<@([A-Z0-9]+)>$/i.test(trimmed)) {
    return true;
  }
  if (/^(user|channel):/i.test(trimmed)) {
    return true;
  }
  if (/^slack:/i.test(trimmed)) {
    return true;
  }
  if (/^[@#]/.test(trimmed)) {
    return true;
  }
  return /^[CUWGD][A-Z0-9]{8,}$/i.test(trimmed);
}
