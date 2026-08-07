/**
 * System-prompt contribution for routing durable skill edits through the
 * Skill Workshop tool instead of direct filesystem writes.
 */

/**
 * Runtime attestation (ADR 0005 H9). Declares the implementation status
 * of each runtime export in this module. See CONTRIBUTING.md § Module
 * attestations for the category definitions and the convention for
 * updating these when sync or rebrand changes the surface.
 */
export const MODULE_ATTESTATIONS = {
  buildSkillWorkshopPromptSection: "live",
} as const;
export const SKILL_WORKSHOP_TOOL_NAME = "skill_workshop";

/** Build the system-prompt section for Skill Workshop routing rules. */
export function buildSkillWorkshopPromptSection(): string[] {
  return [
    "## Skill Workshop",
    "Route durable skill work — creating, updating, or managing reusable skills, playbooks, or standing workflows — through the `skill_workshop` tool; never write proposal or skill files directly.",
    "Generated skills are pending proposals. Apply, reject, or quarantine only when the user explicitly asks.",
    "",
  ];
}
