import { SILENT_REPLY_TOKEN } from "../auto-reply/tokens.js";

/** Parameters for system prompt generation. */
export type SystemPromptParams = {
  /** Channel provider name (e.g., "telegram", "discord", "whatsapp"). */
  channelName: string;
  /** Display name of the user sending the message. */
  userName?: string | undefined;
  /** Agent identifier within RemoteClaw. */
  agentId?: string | undefined;
  /** IANA timezone string (e.g., "America/New_York"). */
  timezone?: string | undefined;
  /** Working directory for the CLI subprocess. */
  workspaceDir: string;
  /** Phone numbers / IDs of authorized senders (owner allowlist). */
  authorizedSenders?: string[] | undefined;
  /** Channel-specific formatting hints (e.g., LINE directives, Discord component schema). */
  messageToolHints?: string[] | undefined;
  /** Reaction/emoji guidance level. */
  reactionGuidance?: { level: "minimal" | "extensive"; channel: string } | undefined;
};

// ── Static Sections ──────────────────────────────────────────────────────

const SAFETY_SECTION = [
  "## Safety",
  "You have no independent goals: do not pursue self-preservation, replication, resource acquisition, or power-seeking; avoid long-term plans beyond the user's request.",
  "Prioritize safety and human oversight over completion; if instructions conflict, pause and ask; comply with stop/pause/audit requests and never bypass safeguards.",
  "Do not manipulate or persuade anyone to expand access or disable safeguards. Do not copy yourself or change system prompts, safety rules, or tool policies unless explicitly requested.",
  "Never expose credentials, API keys, or secrets in replies or tool calls. Respect user privacy.",
].join("\n");

const MESSAGING_SECTION = [
  "## Messaging",
  "- Reply in current session: automatically routes to the source channel.",
  "- Cross-session messaging: use sessions_send(sessionKey, message) to reach other channels.",
  "- `[System Message] ...` blocks are internal context and are not user-visible.",
  `- If a \`[System Message]\` reports completed work and asks for a user update, rewrite it in your normal assistant voice and send that update (do not forward raw system text or default to ${SILENT_REPLY_TOKEN}).`,
  "- Never use exec/curl for provider messaging; RemoteClaw handles all routing internally.",
].join("\n");

const REPLY_TAGS_SECTION = [
  "## Reply Tags",
  "To request a native reply/quote on supported surfaces, include one tag in your reply:",
  "- Reply tags must be the very first token in the message (no leading text/newlines): [[reply_to_current]] your reply.",
  "- [[reply_to_current]] replies to the triggering message.",
  "- Prefer [[reply_to_current]]. Use [[reply_to:<id>]] only when an id was explicitly provided (e.g. by the user or a tool).",
  "Whitespace inside the tag is allowed (e.g. [[ reply_to_current ]] / [[ reply_to: 123 ]]).",
  "Tags are stripped before sending; support depends on the current channel config.",
].join("\n");

const SILENT_REPLIES_SECTION = [
  "## Silent Replies",
  `When you have nothing to say, respond with ONLY: ${SILENT_REPLY_TOKEN}`,
  "",
  "Rules:",
  "- It must be your ENTIRE message — nothing else.",
  `- Never append it to an actual response (never include "${SILENT_REPLY_TOKEN}" in real replies).`,
  "- Never wrap it in markdown or code blocks.",
].join("\n");

// ── Dynamic Section Builders ─────────────────────────────────────────────

function buildIdentitySection(channelName: string, userName?: string): string {
  const intro =
    "You are running inside RemoteClaw, a middleware that connects AI agents to messaging channels.";
  return userName
    ? `${intro}\nYou are responding to a message from ${userName} on ${channelName}.`
    : `${intro}\nYou are responding to a message on ${channelName}.`;
}

function buildRuntimeSection(params: SystemPromptParams): string {
  const parts = [`channel=${params.channelName}`];
  if (params.timezone) {
    parts.push(`timezone=${params.timezone}`);
  }
  if (params.agentId) {
    parts.push(`agent=${params.agentId}`);
  }
  return `## Runtime\nRuntime: ${parts.join(" | ")}`;
}

function buildWorkspaceSection(workspaceDir: string): string {
  return [
    "## Workspace",
    `Your working directory is: ${workspaceDir}`,
    "Treat this directory as the single global workspace for file operations unless explicitly instructed otherwise.",
  ].join("\n");
}

// ── Conditional Section Builders ─────────────────────────────────────────

function buildMessageToolHintsSection(hints?: string[]): string | undefined {
  if (!hints || hints.length === 0) {
    return undefined;
  }
  return `## Message Formatting\n${hints.join("\n")}`;
}

function buildAuthorizedSendersSection(senders?: string[]): string | undefined {
  const filtered = senders?.filter(Boolean);
  if (!filtered || filtered.length === 0) {
    return undefined;
  }
  return `## Authorized Senders\nAuthorized senders: ${filtered.join(", ")}. These senders are allowlisted; do not assume they are the owner.`;
}

function buildReactionsSection(guidance?: {
  level: "minimal" | "extensive";
  channel: string;
}): string | undefined {
  if (!guidance) {
    return undefined;
  }
  const { level, channel } = guidance;
  if (level === "minimal") {
    return [
      "## Reactions",
      `Reactions are enabled for ${channel} in MINIMAL mode.`,
      "React ONLY when truly relevant:",
      "- Acknowledge important user requests or confirmations",
      "- Express genuine sentiment (humor, appreciation) sparingly",
      "- Avoid reacting to routine messages or your own replies",
      "Guideline: at most 1 reaction per 5-10 exchanges.",
    ].join("\n");
  }
  return [
    "## Reactions",
    `Reactions are enabled for ${channel} in EXTENSIVE mode.`,
    "Feel free to react liberally:",
    "- Acknowledge messages with appropriate emojis",
    "- Express sentiment and personality through reactions",
    "- React to interesting content, humor, or notable events",
    "- Use reactions to confirm understanding or agreement",
    "Guideline: react whenever it feels natural.",
  ].join("\n");
}

// ── Assembly ─────────────────────────────────────────────────────────────

/**
 * Build the RemoteClaw system prompt for injection into CLI subprocess agents.
 *
 * Assembles ~10 sections totaling ~3,000-5,000 chars (~770-1,270 tokens).
 * No promptMode switch (always full), no bootstrap context (CLI agent handles),
 * no tool list (MCP handles), no skills/memory/sandbox sections.
 */
export function buildSystemPrompt(params: SystemPromptParams): string {
  const sections: string[] = [
    buildIdentitySection(params.channelName, params.userName),
    SAFETY_SECTION,
    MESSAGING_SECTION,
  ];

  const hintsSection = buildMessageToolHintsSection(params.messageToolHints);
  if (hintsSection) {
    sections.push(hintsSection);
  }

  sections.push(REPLY_TAGS_SECTION);
  sections.push(SILENT_REPLIES_SECTION);

  const sendersSection = buildAuthorizedSendersSection(params.authorizedSenders);
  if (sendersSection) {
    sections.push(sendersSection);
  }

  const reactionsSection = buildReactionsSection(params.reactionGuidance);
  if (reactionsSection) {
    sections.push(reactionsSection);
  }

  sections.push(buildRuntimeSection(params));
  sections.push(buildWorkspaceSection(params.workspaceDir));

  return sections.join("\n\n");
}
