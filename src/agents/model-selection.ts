// Stub — gutted in RemoteClaw fork (Middleware Boundary Principle)

export type ModelSelectionResult = {
  model?: string;
  provider?: string;
  contextTokens?: number;
  reasoningLevel?: string;
};

export const resolveModelSelection = (..._args: unknown[]) => ({}) as ModelSelectionResult;
export const resolveModelSelectionForCron = (..._args: unknown[]) => ({}) as ModelSelectionResult;
export const resolveDefaultModelForAgent = (..._args: unknown[]) =>
  ({ provider: "", model: "" }) as ModelRef;

export type ThinkLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "adaptive";
export type ModelRef = { provider: string; model: string };
export type ModelRefStatus = Record<string, unknown>;
export type ModelAliasIndex = Record<string, unknown>;

export function modelKey(provider: string, model: string): string {
  return `${provider}/${model}`;
}

export function isCliProvider(_provider: string, ..._rest: unknown[]): boolean {
  return false;
}

export function normalizeModelRef(_provider: string, _model: string): ModelRef {
  return { provider: "", model: "" };
}

export function parseModelRef(..._args: unknown[]): ModelRef {
  return { provider: "", model: "" };
}

export function normalizeProviderId(id: string): string {
  return id;
}

export function resolveConfiguredModelRef(..._args: unknown[]): ModelRef {
  return { provider: "", model: "" };
}

export type AllowedModelSetResult = {
  allowedKeys: Set<string>;
  allowedCatalog: Record<string, unknown>[];
  allowAny?: boolean;
};

export function buildAllowedModelSet(..._args: unknown[]): AllowedModelSetResult {
  return { allowedKeys: new Set(), allowedCatalog: [], allowAny: false };
}

export function getModelRefStatus(..._args: unknown[]): ModelRefStatus {
  return {};
}

export function resolveThinkingDefault(..._args: unknown[]): ThinkLevel {
  return "off";
}

export function resolveHooksGmailModel(..._args: unknown[]): string | undefined {
  return undefined;
}
