import { normalizeStructuredPromptSection } from "./prompt-cache-stability.js";

export const MODULE_ATTESTATIONS = {
  wrapPluginSystemContextSection: "live",
} as const;

const HOOK_SYSTEM_CONTEXT_HEADER =
  "RemoteClaw plugin-injected system context. This block is not workspace file content.";

export function wrapPluginSystemContextSection(value?: string): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = normalizeStructuredPromptSection(value);
  if (!normalized) {
    return undefined;
  }
  return `---\n\n${HOOK_SYSTEM_CONTEXT_HEADER}\n\n${normalized}\n\n---`;
}
