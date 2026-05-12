/**
 * Runtime attestation (ADR 0005 H9). Declares the implementation status
 * of each runtime export in this module. See CONTRIBUTING.md § Module
 * attestations for the category definitions and the convention for
 * updating these when sync or rebrand changes the surface.
 */
export const MODULE_ATTESTATIONS = {
  isExecLikeToolName: "live",
} as const;

export type ToolErrorSummary = {
  toolName: string;
  meta?: string;
  error?: string;
  timedOut?: boolean;
  mutatingAction?: boolean;
  actionFingerprint?: string;
};

const EXEC_LIKE_TOOL_NAMES = new Set(["exec", "bash"]);

export function isExecLikeToolName(toolName: string): boolean {
  return EXEC_LIKE_TOOL_NAMES.has(toolName.trim().toLowerCase());
}
