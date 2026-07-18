/* eslint-disable @typescript-eslint/no-explicit-any */
// Gutted in RemoteClaw fork (Middleware Boundary Principle)
// Minimal stub: preserves security audit deny/allow policy checks.
import { compileGlobPatterns, matchesAnyGlobPattern } from "./glob-pattern.js";
import { expandToolGroups, normalizeToolName } from "./tool-policy-shared.js";

type ToolPolicy = { allow?: string[]; deny?: string[] };

function isToolAllowedByPolicyName(name: string, policy?: ToolPolicy): boolean {
  if (!policy) {
    return true;
  }
  const deny = compileGlobPatterns({
    raw: expandToolGroups(policy.deny ?? []),
    normalize: normalizeToolName,
  });
  const allow = compileGlobPatterns({
    raw: expandToolGroups(policy.allow ?? []),
    normalize: normalizeToolName,
  });
  const normalized = normalizeToolName(name);
  if (matchesAnyGlobPattern(normalized, deny)) {
    return false;
  }
  if (normalized === "apply_patch" && matchesAnyGlobPattern("write", deny)) {
    return false;
  }
  if (allow.length === 0) {
    return true;
  }
  if (matchesAnyGlobPattern(normalized, allow)) {
    return true;
  }
  if (normalized === "apply_patch" && matchesAnyGlobPattern("write", allow)) {
    return true;
  }
  return false;
}

export const isToolAllowedByPolicies = (name: string, policies: Array<ToolPolicy | undefined>) =>
  policies.every((policy) => isToolAllowedByPolicyName(name, policy));
export const resolveEffectiveToolPolicy = (..._args: unknown[]) => undefined as any;
export const resolveGroupToolPolicy = (..._args: unknown[]) => undefined as any;
export const resolveSubagentToolPolicy = (..._args: unknown[]) => undefined as any;

/**
 * Runtime attestation (ADR 0005 H9). Declares the implementation status
 * of each runtime export in this module. See CONTRIBUTING.md § Module
 * attestations for the category definitions and the convention for
 * updating these when sync or rebrand changes the surface.
 */
export const MODULE_ATTESTATIONS = {
  isToolAllowedByPolicies: "live",
  resolveEffectiveToolPolicy: "partial", // returns undefined; callers tolerate
  resolveGroupToolPolicy: "partial", // returns undefined; callers tolerate
  resolveSubagentToolPolicy: "partial", // returns undefined; callers tolerate
} as const;
