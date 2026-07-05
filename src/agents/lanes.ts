import { CommandLane } from "../process/lanes.js";

/**
 * Runtime attestation (ADR 0005 H9). Declares the implementation status
 * of each runtime export in this module. See CONTRIBUTING.md § Module
 * attestations for the category definitions and the convention for
 * updating these when sync or rebrand changes the surface.
 */
export const MODULE_ATTESTATIONS = {
  resolveNestedAgentLane: "live",
  resolveNestedAgentLaneForSession: "live",
  isNestedAgentLane: "live",
  resolveCronAgentLane: "live",
} as const;

export const AGENT_LANE_NESTED = CommandLane.Nested;
export const AGENT_LANE_CRON_NESTED = CommandLane.CronNested;
export const AGENT_LANE_SUBAGENT = CommandLane.Subagent;
const AGENT_LANE_CRON: string = CommandLane.Cron;
const NESTED_LANE = "nested";
const NESTED_LANE_PREFIX = `${NESTED_LANE}:`;

export function resolveNestedAgentLane(lane?: string): string {
  const trimmed = lane?.trim();
  if (!trimmed) {
    return AGENT_LANE_NESTED;
  }
  return trimmed;
}

export function resolveCronAgentLane(lane?: string): string {
  const trimmed = lane?.trim();
  // Cron jobs already occupy the outer cron lane, so inner agent work needs
  // its own lane to avoid self-deadlock without widening shared nested flows.
  if (!trimmed || trimmed === AGENT_LANE_CRON) {
    return AGENT_LANE_CRON_NESTED;
  }
  return trimmed;
}

export function resolveNestedAgentLaneForSession(sessionKey: string | undefined): string {
  const trimmed = sessionKey?.trim();
  if (!trimmed) {
    return AGENT_LANE_NESTED;
  }
  return `${NESTED_LANE_PREFIX}${trimmed}`;
}

export function isNestedAgentLane(lane: string | undefined): boolean {
  if (!lane) {
    return false;
  }
  return lane === NESTED_LANE || lane.startsWith(NESTED_LANE_PREFIX);
}
