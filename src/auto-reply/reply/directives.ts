import { escapeRegExp } from "../../utils.js";
import type { NoticeLevel } from "../thinking.js";
import { normalizeNoticeLevel, normalizeVerboseLevel, type VerboseLevel } from "../thinking.js";

type ExtractedLevel<T> = {
  cleaned: string;
  level?: T;
  rawLevel?: string;
  hasDirective: boolean;
};

const matchLevelDirective = (
  body: string,
  names: string[],
): { start: number; end: number; rawLevel?: string } | null => {
  const namePattern = names.map(escapeRegExp).join("|");
  const match = body.match(new RegExp(`(?:^|\\s)\\/(?:${namePattern})(?=$|\\s|:)`, "i"));
  if (!match || match.index === undefined) {
    return null;
  }
  const start = match.index;
  let end = match.index + match[0].length;
  let i = end;
  while (i < body.length && /\s/.test(body[i])) {
    i += 1;
  }
  if (body[i] === ":") {
    i += 1;
    while (i < body.length && /\s/.test(body[i])) {
      i += 1;
    }
  }
  const argStart = i;
  while (i < body.length && /[A-Za-z-]/.test(body[i])) {
    i += 1;
  }
  const rawLevel = i > argStart ? body.slice(argStart, i) : undefined;
  end = i;
  return { start, end, rawLevel };
};

const extractLevelDirective = <T>(
  body: string,
  names: string[],
  normalize: (raw?: string) => T | undefined,
): ExtractedLevel<T> => {
  const match = matchLevelDirective(body, names);
  if (!match) {
    return { cleaned: body.trim(), hasDirective: false };
  }
  const rawLevel = match.rawLevel;
  const level = normalize(rawLevel);
  const cleaned = body
    .slice(0, match.start)
    .concat(" ")
    .concat(body.slice(match.end))
    .replace(/\s+/g, " ")
    .trim();
  return {
    cleaned,
    level,
    rawLevel,
    hasDirective: true,
  };
};

const extractSimpleDirective = (
  body: string,
  names: string[],
): { cleaned: string; hasDirective: boolean } => {
  const namePattern = names.map(escapeRegExp).join("|");
  const match = body.match(
    new RegExp(`(?:^|\\s)\\/(?:${namePattern})(?=$|\\s|:)(?:\\s*:\\s*)?`, "i"),
  );
  const cleaned = match ? body.replace(match[0], " ").replace(/\s+/g, " ").trim() : body.trim();
  return {
    cleaned,
    hasDirective: Boolean(match),
  };
};

export function extractVerboseDirective(body?: string): {
  cleaned: string;
  verboseLevel?: VerboseLevel;
  rawLevel?: string;
  hasDirective: boolean;
} {
  if (!body) {
    return { cleaned: "", hasDirective: false };
  }
  const extracted = extractLevelDirective(body, ["verbose", "v"], normalizeVerboseLevel);
  return {
    cleaned: extracted.cleaned,
    verboseLevel: extracted.level,
    rawLevel: extracted.rawLevel,
    hasDirective: extracted.hasDirective,
  };
}

export function extractNoticeDirective(body?: string): {
  cleaned: string;
  noticeLevel?: NoticeLevel;
  rawLevel?: string;
  hasDirective: boolean;
} {
  if (!body) {
    return { cleaned: "", hasDirective: false };
  }
  const extracted = extractLevelDirective(body, ["notice", "notices"], normalizeNoticeLevel);
  return {
    cleaned: extracted.cleaned,
    noticeLevel: extracted.level,
    rawLevel: extracted.rawLevel,
    hasDirective: extracted.hasDirective,
  };
}

export function extractStatusDirective(body?: string): {
  cleaned: string;
  hasDirective: boolean;
} {
  if (!body) {
    return { cleaned: "", hasDirective: false };
  }
  return extractSimpleDirective(body, ["status"]);
}

export type { NoticeLevel, VerboseLevel };
