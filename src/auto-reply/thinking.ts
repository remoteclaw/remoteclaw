export type VerboseLevel = "off" | "on" | "full";
export type NoticeLevel = "off" | "on" | "full";
export type ElevatedLevel = "off" | "on" | "ask" | "full";
export type ElevatedMode = "off" | "ask" | "full";
export type ReasoningLevel = "off" | "on" | "stream";
export type UsageDisplayLevel = "off" | "tokens" | "full";
export type ThinkingCatalogEntry = {
  provider: string;
  id: string;
  reasoning?: boolean;
};

function normalizeProviderId(provider?: string | null): string {
  if (!provider) {
    return "";
  }
  const normalized = provider.trim().toLowerCase();
  if (normalized === "z.ai" || normalized === "z-ai") {
    return "zai";
  }
  if (normalized === "bedrock" || normalized === "aws-bedrock") {
    return "amazon-bedrock";
  }
  return normalized;
}

export function isBinaryThinkingProvider(provider?: string | null): boolean {
  return normalizeProviderId(provider) === "zai";
}

export function listThinkingLevels(_provider?: string | null, _model?: string | null): string[] {
  return ["off", "minimal", "low", "medium", "high", "adaptive"];
}

type OnOffFullLevel = "off" | "on" | "full";

function normalizeOnOffFullLevel(raw?: string | null): OnOffFullLevel | undefined {
  if (!raw) {
    return undefined;
  }
  const key = raw.toLowerCase();
  if (["off", "false", "no", "0"].includes(key)) {
    return "off";
  }
  if (["full", "all", "everything"].includes(key)) {
    return "full";
  }
  if (["on", "minimal", "true", "yes", "1"].includes(key)) {
    return "on";
  }
  return undefined;
}

// Normalize verbose flags used to toggle agent verbosity.
export function normalizeVerboseLevel(raw?: string | null): VerboseLevel | undefined {
  return normalizeOnOffFullLevel(raw);
}

// Normalize system notice flags used to toggle system notifications.
export function normalizeNoticeLevel(raw?: string | null): NoticeLevel | undefined {
  return normalizeOnOffFullLevel(raw);
}

// Normalize response-usage display modes used to toggle per-response usage footers.
export function normalizeUsageDisplay(raw?: string | null): UsageDisplayLevel | undefined {
  if (!raw) {
    return undefined;
  }
  const key = raw.toLowerCase();
  if (["off", "false", "no", "0", "disable", "disabled"].includes(key)) {
    return "off";
  }
  if (["on", "true", "yes", "1", "enable", "enabled"].includes(key)) {
    return "tokens";
  }
  if (["tokens", "token", "tok", "minimal", "min"].includes(key)) {
    return "tokens";
  }
  if (["full", "session"].includes(key)) {
    return "full";
  }
  return undefined;
}

export function resolveResponseUsageMode(raw?: string | null): UsageDisplayLevel {
  return normalizeUsageDisplay(raw) ?? "off";
}

// Normalize fast-mode flags used to toggle low-latency model behavior.
export function normalizeFastMode(raw?: string | boolean | null): boolean | undefined {
  if (typeof raw === "boolean") {
    return raw;
  }
  if (!raw) {
    return undefined;
  }
  const key = raw.toLowerCase();
  if (["off", "false", "no", "0", "disable", "disabled", "normal"].includes(key)) {
    return false;
  }
  if (["on", "true", "yes", "1", "enable", "enabled", "fast"].includes(key)) {
    return true;
  }
  return undefined;
}

// Normalize elevated flags used to toggle elevated bash permissions.
export function normalizeElevatedLevel(raw?: string | null): ElevatedLevel | undefined {
  if (!raw) {
    return undefined;
  }
  const key = raw.toLowerCase();
  if (["off", "false", "no", "0"].includes(key)) {
    return "off";
  }
  if (["full", "auto", "auto-approve", "autoapprove"].includes(key)) {
    return "full";
  }
  if (["ask", "prompt", "approval", "approve"].includes(key)) {
    return "ask";
  }
  if (["on", "true", "yes", "1"].includes(key)) {
    return "on";
  }
  return undefined;
}

export function resolveElevatedMode(level?: ElevatedLevel | null): ElevatedMode {
  if (!level || level === "off") {
    return "off";
  }
  if (level === "full") {
    return "full";
  }
  return "ask";
}

// Normalize reasoning visibility flags used to toggle reasoning exposure.
export function normalizeReasoningLevel(raw?: string | null): ReasoningLevel | undefined {
  if (!raw) {
    return undefined;
  }
  const key = raw.toLowerCase();
  if (["off", "false", "no", "0", "hide", "hidden", "disable", "disabled"].includes(key)) {
    return "off";
  }
  if (["on", "true", "yes", "1", "show", "visible", "enable", "enabled"].includes(key)) {
    return "on";
  }
  if (["stream", "streaming", "draft", "live"].includes(key)) {
    return "stream";
  }
  return undefined;
}
