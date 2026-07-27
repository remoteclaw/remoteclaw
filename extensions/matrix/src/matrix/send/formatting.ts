import type { MatrixClient } from "@vector-im/matrix-bot-sdk";
import { getMatrixRuntime } from "../../runtime.js";
import {
  markdownToMatrixHtml,
  renderMarkdownToMatrixHtmlWithMentions,
  resolveMatrixMentionsInMarkdown,
  type MatrixMentions,
} from "../format.js";
import {
  MsgType,
  RelationType,
  type MatrixFormattedContent,
  type MatrixMediaMsgType,
  type MatrixRelation,
  type MatrixReplyRelation,
  type MatrixTextContent,
  type MatrixThreadRelation,
} from "./types.js";

const getCore = () => getMatrixRuntime();

export type { MatrixMentions } from "../format.js";

async function renderMatrixFormattedContent(params: {
  client: MatrixClient;
  markdown?: string | null;
  includeMentions?: boolean;
}): Promise<{ html?: string; mentions?: MatrixMentions }> {
  const markdown = params.markdown ?? "";
  if (params.includeMentions === false) {
    const html = markdownToMatrixHtml(markdown).trimEnd();
    return { html: html || undefined };
  }
  const { html, mentions } = await renderMarkdownToMatrixHtmlWithMentions({
    markdown,
    client: params.client,
  });
  return { html, mentions };
}

export function buildTextContent(body: string, relation?: MatrixRelation): MatrixTextContent {
  return relation
    ? {
        msgtype: MsgType.Text,
        body,
        "m.relates_to": relation,
      }
    : {
        msgtype: MsgType.Text,
        body,
      };
}

/**
 * Renders `markdown` into the event's `formatted_body` and attaches the
 * resulting `m.mentions` metadata. Both are derived from the same render pass,
 * so the HTML pills and the mentions list can never disagree.
 */
export async function enrichMatrixFormattedContent(params: {
  client: MatrixClient;
  content: MatrixFormattedContent;
  markdown?: string | null;
  includeMentions?: boolean;
}): Promise<void> {
  const { html, mentions } = await renderMatrixFormattedContent({
    client: params.client,
    markdown: params.markdown,
    includeMentions: params.includeMentions,
  });
  if (mentions) {
    params.content["m.mentions"] = mentions;
  } else {
    delete params.content["m.mentions"];
  }
  if (!html) {
    delete params.content.format;
    delete params.content.formatted_body;
    return;
  }
  params.content.format = "org.matrix.custom.html";
  params.content.formatted_body = html;
}

export async function resolveMatrixMentionsForBody(params: {
  client: MatrixClient;
  body: string;
}): Promise<MatrixMentions> {
  return await resolveMatrixMentionsInMarkdown({
    markdown: params.body ?? "",
    client: params.client,
  });
}

function normalizeMentionUserIds(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
}

/**
 * Reads `m.mentions` back off an existing event. Ported for upstream parity but
 * not yet wired here: upstream only calls it from the message-edit path, which
 * this fork does not carry (which is also why upstream's companion
 * `diffMatrixMentions` is absent). Inbound mention detection is a separate
 * pipeline in `monitor/mentions.ts`.
 */
export function extractMatrixMentions(
  content: Record<string, unknown> | undefined,
): MatrixMentions {
  const rawMentions = content?.["m.mentions"];
  if (!rawMentions || typeof rawMentions !== "object") {
    return {};
  }
  const mentions = rawMentions as { room?: unknown; user_ids?: unknown };
  const normalized: MatrixMentions = {};
  const userIds = normalizeMentionUserIds(mentions.user_ids);
  if (userIds.length > 0) {
    normalized.user_ids = userIds;
  }
  if (mentions.room === true) {
    normalized.room = true;
  }
  return normalized;
}

export function buildReplyRelation(replyToId?: string): MatrixReplyRelation | undefined {
  const trimmed = replyToId?.trim();
  if (!trimmed) {
    return undefined;
  }
  return { "m.in_reply_to": { event_id: trimmed } };
}

export function buildThreadRelation(threadId: string, replyToId?: string): MatrixThreadRelation {
  const trimmed = threadId.trim();
  return {
    rel_type: RelationType.Thread,
    event_id: trimmed,
    is_falling_back: true,
    "m.in_reply_to": { event_id: replyToId?.trim() || trimmed },
  };
}

export function resolveMatrixMsgType(contentType?: string, _fileName?: string): MatrixMediaMsgType {
  const kind = getCore().media.mediaKindFromMime(contentType ?? "");
  switch (kind) {
    case "image":
      return MsgType.Image;
    case "audio":
      return MsgType.Audio;
    case "video":
      return MsgType.Video;
    default:
      return MsgType.File;
  }
}

export function resolveMatrixVoiceDecision(opts: {
  wantsVoice: boolean;
  contentType?: string;
  fileName?: string;
}): {
  useVoice: boolean;
} {
  if (!opts.wantsVoice) {
    return { useVoice: false };
  }
  if (isMatrixVoiceCompatibleAudio(opts)) {
    return { useVoice: true };
  }
  return { useVoice: false };
}

function isMatrixVoiceCompatibleAudio(opts: { contentType?: string; fileName?: string }): boolean {
  // Matrix currently shares the core voice compatibility policy.
  // Keep this wrapper as the seam if Matrix policy diverges later.
  return getCore().media.isVoiceCompatibleAudio({
    contentType: opts.contentType,
    fileName: opts.fileName,
  });
}
