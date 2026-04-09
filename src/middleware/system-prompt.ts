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
  /** Channel-specific formatting hints (e.g., LINE directives, Discord component schema). */
  messageToolHints?: string[] | undefined;
  /** Reaction/emoji guidance level. */
  reactionGuidance?: { level: "minimal" | "extensive"; channel: string } | undefined;
};

// ── Static Sections ──────────────────────────────────────────────────────

const MESSAGING_SECTION = [
  "## Messaging",
  "`[System Message] ...` blocks are internal context injected by the middleware — do not forward them to users.",
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

function buildRuntimeSection(params: SystemPromptParams): string {
  const parts = [`channel=${params.channelName}`];
  if (params.userName) {
    parts.push(`user=${params.userName}`);
  }
  if (params.timezone) {
    parts.push(`timezone=${params.timezone}`);
  }
  if (params.agentId) {
    parts.push(`agent=${params.agentId}`);
  }
  return `## Runtime\nRuntime: ${parts.join(" | ")}`;
}

// ── Conditional Section Builders ─────────────────────────────────────────

function buildMessageToolHintsSection(hints?: string[]): string | undefined {
  if (!hints || hints.length === 0) {
    return undefined;
  }
  return `## Message Formatting\n${hints.join("\n")}`;
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
 * Assembles ~9 sections totaling ~2,500-4,500 chars (~640-1,150 tokens).
 * No promptMode switch (always full), no bootstrap context (CLI agent handles),
 * no tool list (MCP handles), no skills/memory/sandbox sections.
 */
export function buildSystemPrompt(params: SystemPromptParams): string {
  const sections: string[] = [MESSAGING_SECTION];

  const hintsSection = buildMessageToolHintsSection(params.messageToolHints);
  if (hintsSection) {
    sections.push(hintsSection);
  }

  sections.push(REPLY_TAGS_SECTION);
  sections.push(SILENT_REPLIES_SECTION);

  const reactionsSection = buildReactionsSection(params.reactionGuidance);
  if (reactionsSection) {
    sections.push(reactionsSection);
  }

  sections.push(buildRuntimeSection(params));

  return sections.join("\n\n");
}
