// Matrix helper module supports format behavior.
import type { MatrixClient } from "@vector-im/matrix-bot-sdk";
import MarkdownIt from "markdown-it";
import { normalizeLowercaseStringOrEmpty } from "remoteclaw/plugin-sdk/string-coerce-runtime";

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  typographer: false,
});

md.enable("strikethrough");

const { escapeHtml } = md.utils;

export type MatrixMentions = {
  room?: boolean;
  user_ids?: string[];
};

type MarkdownToken = ReturnType<typeof md.parse>[number];
type MarkdownInlineToken = NonNullable<MarkdownToken["children"]>[number];
type MatrixMentionCandidate = {
  raw: string;
  start: number;
  end: number;
  kind: "room" | "user";
  userId?: string;
};

/**
 * Minimal structural view of the one `MatrixClient` member the mention pipeline
 * needs. Upstream spells this as an inline cast at the point of use
 * (`(client as { getUserId?: ... }).getUserId`); naming it keeps the cast out of
 * the function body. `getUserId` stays optional because the guard below still
 * has to tolerate a client that does not expose it.
 */
type MatrixMentionSelfClient = {
  getUserId?: () => Promise<string> | string;
};

// Private-use code point (U+E000) used to park `\@` escapes while the mention
// scanner runs, so escaped mentions are never turned into pills. Written as an
// escape sequence on purpose: the raw character is invisible in review.
const ESCAPED_MENTION_SENTINEL = "\uE000";
const MENTION_PATTERN = /@[A-Za-z0-9._=+\-/:[\]]+/g;
const MATRIX_MENTION_SERVER_NAME_PATTERN =
  /(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)(?:\.(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?))*(?::\d+)?/;
const MATRIX_MENTION_USER_ID_PATTERN = new RegExp(
  `^@[A-Za-z0-9._=+\\-/]+:(?:${MATRIX_MENTION_SERVER_NAME_PATTERN.source}|\\[[0-9A-Fa-f:.]+\\](?::\\d+)?)$`,
);
const TRIMMABLE_MENTION_SUFFIX = /[),.!?:;\]]/;

/**
 * File extensions that share TLDs and commonly appear in code/documentation.
 * markdown-it's linkify auto-links bare tokens like `README.md` or `backup.sh`
 * into `http://README.md` / `http://backup.sh` (`.md` is Moldova, `.sh` is
 * Saint Helena), turning innocuous file references in agent output into
 * clickable external URLs. These extensions suppress that.
 *
 * Excluded: .ai, .io, .tv, .fm (popular domain TLDs like x.ai, vercel.io).
 */
const FILE_EXTENSIONS_WITH_TLD = new Set([
  "md", // Markdown (Moldova) - very common in repos
  "go", // Go language - common in Go projects
  "py", // Python (Paraguay) - common in Python projects
  "pl", // Perl (Poland) - common in Perl projects
  "sh", // Shell (Saint Helena) - common for scripts
  "am", // Automake files (Armenia)
  "at", // Assembly (Austria)
  "be", // Backend files (Belgium)
  "cc", // C++ source (Cocos Islands)
]);

/** Detects when markdown-it linkify auto-generated a link from a bare filename (e.g. README.md → http://README.md). */
function isAutoLinkedFileRef(href: string, label: string): boolean {
  const stripped = href.replace(/^https?:\/\//i, "");
  if (stripped !== label) {
    return false;
  }
  const dotIndex = label.lastIndexOf(".");
  if (dotIndex < 1) {
    return false;
  }
  const ext = label.slice(dotIndex + 1).toLowerCase();
  if (!FILE_EXTENSIONS_WITH_TLD.has(ext)) {
    return false;
  }
  // Reject if any path segment before the filename contains a dot (looks like a domain).
  const segments = label.split("/");
  for (let i = 0; i < segments.length - 1; i += 1) {
    if (segments[i].includes(".")) {
      return false;
    }
  }
  return true;
}

function shouldSuppressAutoLink(
  tokens: Parameters<NonNullable<typeof md.renderer.rules.link_open>>[0],
  idx: number,
): boolean {
  const token = tokens[idx];
  if (token?.type !== "link_open" || token.info !== "auto") {
    return false;
  }
  const href = token.attrGet("href") ?? "";
  const label = tokens[idx + 1]?.type === "text" ? (tokens[idx + 1]?.content ?? "") : "";
  return Boolean(href && label && isAutoLinkedFileRef(href, label));
}

md.renderer.rules.image = (tokens, idx) => escapeHtml(tokens[idx]?.content ?? "");

md.renderer.rules.html_block = (tokens, idx) => escapeHtml(tokens[idx]?.content ?? "");
md.renderer.rules.html_inline = (tokens, idx) => escapeHtml(tokens[idx]?.content ?? "");
md.renderer.rules.link_open = (tokens, idx, options, _env, self) =>
  shouldSuppressAutoLink(tokens, idx) ? "" : self.renderToken(tokens, idx, options);
md.renderer.rules.link_close = (tokens, idx, options, _env, self) => {
  const openIdx = idx - 2;
  if (openIdx >= 0 && shouldSuppressAutoLink(tokens, openIdx)) {
    return "";
  }
  return self.renderToken(tokens, idx, options);
};

export function markdownToMatrixHtml(markdown: string): string {
  const rendered = md.render(markdown ?? "");
  return rendered.trimEnd();
}

/**
 * Replaces `\@` escapes outside code spans/fences with a sentinel so the mention
 * scanner cannot see them. Code spans keep their literal backslash — the
 * sentinel is restored differently for code (`restoreEscapedMentionsInCode`)
 * than for prose (`restoreEscapedMentions`).
 */
function maskEscapedMentions(markdown: string): string {
  let masked = "";
  let idx = 0;
  let codeFenceLength = 0;

  while (idx < markdown.length) {
    if (markdown[idx] === "`" && !isMarkdownEscaped(markdown, idx)) {
      let runLength = 1;
      while (markdown[idx + runLength] === "`") {
        runLength += 1;
      }
      if (codeFenceLength === 0) {
        codeFenceLength = runLength;
      } else if (runLength === codeFenceLength) {
        codeFenceLength = 0;
      }
      masked += markdown.slice(idx, idx + runLength);
      idx += runLength;
      continue;
    }
    if (codeFenceLength === 0 && markdown[idx] === "\\" && markdown[idx + 1] === "@") {
      masked += ESCAPED_MENTION_SENTINEL;
      idx += 2;
      continue;
    }
    masked += markdown[idx] ?? "";
    idx += 1;
  }

  return masked;
}

function isMarkdownEscaped(markdown: string, idx: number): boolean {
  let slashCount = 0;
  let cursor = idx - 1;
  while (cursor >= 0 && markdown[cursor] === "\\") {
    slashCount += 1;
    cursor -= 1;
  }
  return slashCount % 2 === 1;
}

function restoreEscapedMentions(text: string): string {
  return text.replaceAll(ESCAPED_MENTION_SENTINEL, "@");
}

function restoreEscapedMentionsInCode(text: string): string {
  return text.replaceAll(ESCAPED_MENTION_SENTINEL, "\\@");
}

function restoreEscapedMentionsInBlockTokens(tokens: MarkdownToken[]): void {
  for (const token of tokens) {
    if ((token.type === "fence" || token.type === "code_block") && token.content) {
      token.content = restoreEscapedMentionsInCode(token.content);
    }
  }
}

function isMentionStartBoundary(charBefore: string | undefined): boolean {
  return !charBefore || !/[A-Za-z0-9_]/.test(charBefore);
}

function trimMentionSuffix(
  rawInput: string,
  endInput: number,
): { raw: string; end: number } | null {
  let raw = rawInput;
  let end = endInput;
  while (raw.length > 1 && TRIMMABLE_MENTION_SUFFIX.test(raw.at(-1) ?? "")) {
    if (raw.at(-1) === "]" && /\[[0-9A-Fa-f:.]+\](?::\d+)?$/i.test(raw)) {
      break;
    }
    raw = raw.slice(0, -1);
    end -= 1;
  }
  if (!raw.startsWith("@") || raw === "@") {
    return null;
  }
  return { raw, end };
}

/**
 * Fork-local equivalent of upstream's `isMatrixQualifiedUserId` from
 * `./target-ids.js`, which this fork does not carry. Same predicate, inlined
 * here the way `isAutoLinkedFileRef` already is in this module.
 */
function isMatrixQualifiedUserId(raw: string): boolean {
  const trimmed = raw.trim();
  return trimmed.startsWith("@") && trimmed.includes(":");
}

function isMatrixMentionUserId(raw: string): boolean {
  return isMatrixQualifiedUserId(raw) && MATRIX_MENTION_USER_ID_PATTERN.test(raw);
}

function buildMentionCandidate(raw: string, start: number): MatrixMentionCandidate | null {
  const normalized = trimMentionSuffix(raw, start + raw.length);
  if (!normalized) {
    return null;
  }
  const kind = normalizeLowercaseStringOrEmpty(normalized.raw) === "@room" ? "room" : "user";
  const base: MatrixMentionCandidate = {
    raw: normalized.raw,
    start,
    end: normalized.end,
    kind,
  };
  if (kind === "room") {
    return base;
  }
  const userCandidate = isMatrixMentionUserId(normalized.raw)
    ? { ...base, userId: normalized.raw }
    : null;
  if (!userCandidate) {
    return null;
  }
  return userCandidate;
}

function collectMentionCandidates(text: string): MatrixMentionCandidate[] {
  const mentions: MatrixMentionCandidate[] = [];
  for (const match of text.matchAll(MENTION_PATTERN)) {
    const raw = match[0];
    const start = match.index ?? -1;
    if (start < 0 || !raw) {
      continue;
    }
    if (!isMentionStartBoundary(text[start - 1])) {
      continue;
    }
    const candidate = buildMentionCandidate(raw, start);
    if (!candidate) {
      continue;
    }
    mentions.push(candidate);
  }
  return mentions;
}

function createToken(
  sample: MarkdownInlineToken,
  type: string,
  tag: string,
  nesting: number,
): MarkdownInlineToken {
  const TokenCtor = sample.constructor as new (
    type: string,
    tag: string,
    nesting: number,
  ) => MarkdownInlineToken;
  return new TokenCtor(type, tag, nesting);
}

function createTextToken(sample: MarkdownInlineToken, content: string): MarkdownInlineToken {
  const token = createToken(sample, "text", "", 0);
  token.content = content;
  return token;
}

function createMentionLinkTokens(params: {
  sample: MarkdownInlineToken;
  href: string;
  label: string;
}): MarkdownInlineToken[] {
  const open = createToken(params.sample, "link_open", "a", 1);
  open.attrSet("href", params.href);
  const text = createTextToken(params.sample, params.label);
  const close = createToken(params.sample, "link_close", "a", -1);
  return [open, text, close];
}

function resolveMentionUserId(match: MatrixMentionCandidate): string | null {
  if (match.kind !== "user") {
    return null;
  }
  return match.userId ?? null;
}

async function resolveMatrixSelfUserId(client: MatrixMentionSelfClient): Promise<string | null> {
  const getUserId = client.getUserId;
  if (typeof getUserId !== "function") {
    return null;
  }
  return await Promise.resolve(getUserId.call(client)).catch(() => null);
}

function mutateInlineTokensWithMentions(params: {
  children: MarkdownInlineToken[];
  userIds: string[];
  seenUserIds: Set<string>;
  selfUserId: string | null;
}): { children: MarkdownInlineToken[]; roomMentioned: boolean } {
  const nextChildren: MarkdownInlineToken[] = [];
  let roomMentioned = false;
  let insideLinkDepth = 0;
  for (const child of params.children) {
    if (child.type === "link_open") {
      insideLinkDepth += 1;
      nextChildren.push(child);
      continue;
    }
    if (child.type === "link_close") {
      insideLinkDepth = Math.max(0, insideLinkDepth - 1);
      nextChildren.push(child);
      continue;
    }
    if (child.type !== "text" || !child.content) {
      nextChildren.push(child);
      continue;
    }

    const visibleContent = restoreEscapedMentions(child.content);
    if (insideLinkDepth > 0) {
      nextChildren.push(createTextToken(child, visibleContent));
      continue;
    }
    const matches = collectMentionCandidates(child.content);
    if (matches.length === 0) {
      nextChildren.push(createTextToken(child, visibleContent));
      continue;
    }

    let cursor = 0;
    for (const match of matches) {
      if (match.start > cursor) {
        nextChildren.push(
          createTextToken(child, restoreEscapedMentions(child.content.slice(cursor, match.start))),
        );
      }
      cursor = match.end;
      if (match.kind === "room") {
        roomMentioned = true;
        nextChildren.push(createTextToken(child, match.raw));
        continue;
      }

      const resolvedUserId = resolveMentionUserId(match);
      if (!resolvedUserId || resolvedUserId === params.selfUserId) {
        nextChildren.push(createTextToken(child, match.raw));
        continue;
      }
      if (!params.seenUserIds.has(resolvedUserId)) {
        params.seenUserIds.add(resolvedUserId);
        params.userIds.push(resolvedUserId);
      }
      nextChildren.push(
        ...createMentionLinkTokens({
          sample: child,
          href: `https://matrix.to/#/${encodeURIComponent(resolvedUserId)}`,
          label: match.raw,
        }),
      );
    }
    if (cursor < child.content.length) {
      nextChildren.push(
        createTextToken(child, restoreEscapedMentions(child.content.slice(cursor))),
      );
    }
  }
  return { children: nextChildren, roomMentioned };
}

async function resolveMarkdownMentionState(params: {
  markdown: string;
  client: MatrixClient;
}): Promise<{ tokens: MarkdownToken[]; mentions: MatrixMentions }> {
  const markdown = maskEscapedMentions(params.markdown ?? "");
  const tokens = md.parse(markdown, {});
  restoreEscapedMentionsInBlockTokens(tokens);
  const selfUserId = await resolveMatrixSelfUserId(params.client);
  const userIds: string[] = [];
  const seenUserIds = new Set<string>();
  let roomMentioned = false;

  for (const token of tokens) {
    if (!token.children?.length) {
      continue;
    }
    const mutated = mutateInlineTokensWithMentions({
      children: token.children,
      userIds,
      seenUserIds,
      selfUserId,
    });
    token.children = mutated.children;
    roomMentioned ||= mutated.roomMentioned;
  }

  const mentions: MatrixMentions = {};
  if (userIds.length > 0) {
    mentions.user_ids = userIds;
  }
  if (roomMentioned) {
    mentions.room = true;
  }
  return {
    tokens,
    mentions,
  };
}

export async function resolveMatrixMentionsInMarkdown(params: {
  markdown: string;
  client: MatrixClient;
}): Promise<MatrixMentions> {
  const state = await resolveMarkdownMentionState(params);
  return state.mentions;
}

export async function renderMarkdownToMatrixHtmlWithMentions(params: {
  markdown: string;
  client: MatrixClient;
}): Promise<{ html?: string; mentions: MatrixMentions }> {
  const state = await resolveMarkdownMentionState(params);
  const html = md.renderer.render(state.tokens, md.options, {}).trimEnd();
  return {
    html: html || undefined,
    mentions: state.mentions,
  };
}
