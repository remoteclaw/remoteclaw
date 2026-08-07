// Bootstrap mode resolver for deciding whether a run gets full, limited, or no
// workspace bootstrap files.

/**
 * Runtime attestation (ADR 0005 H9). Declares the implementation status
 * of each runtime export in this module. See CONTRIBUTING.md § Module
 * attestations for the category definitions and the convention for
 * updating these when sync or rebrand changes the surface.
 */
export const MODULE_ATTESTATIONS = {
  resolveBootstrapMode: "live",
  isHeartbeatLifecycleRunKind: "live",
} as const;
export type BootstrapMode = "full" | "limited" | "none";
export type BootstrapContextRunKind = "default" | "heartbeat" | "cron" | "commitment-only";

export function isHeartbeatLifecycleRunKind(runKind: BootstrapContextRunKind | undefined): boolean {
  return runKind === "heartbeat" || runKind === "commitment-only";
}

/** Resolve the bootstrap mode for one agent run. */
export function resolveBootstrapMode(params: {
  bootstrapPending: boolean;
  runKind?: BootstrapContextRunKind;
  isInteractiveUserFacing: boolean;
  isPrimaryRun: boolean;
  isCanonicalWorkspace: boolean;
  hasBootstrapFileAccess: boolean;
}): BootstrapMode {
  if (!params.bootstrapPending) {
    return "none";
  }
  if (isHeartbeatLifecycleRunKind(params.runKind) || params.runKind === "cron") {
    // Background maintenance turns should not consume or mutate bootstrap state.
    return "none";
  }
  if (!params.isPrimaryRun || !params.isInteractiveUserFacing) {
    return "none";
  }
  if (!params.hasBootstrapFileAccess) {
    return "limited";
  }
  return params.isCanonicalWorkspace ? "full" : "limited";
}
