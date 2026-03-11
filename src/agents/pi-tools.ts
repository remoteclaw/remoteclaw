/**
 * Stub for upstream pi-tools infrastructure.
 *
 * The upstream pi-agent layer has been gutted in the RemoteClaw fork. This stub
 * provides the minimal API surface that gateway code imports so cherry-picked
 * upstream fixes compile and run without the full pi-agent runtime.
 */

/**
 * No-op stub — returns undefined (no loop detection configured).
 */
export function resolveToolLoopDetectionConfig(_params: {
  cfg?: unknown;
  agentId?: string;
}): unknown {
  return undefined;
}
