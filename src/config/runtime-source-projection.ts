import { createMergePatch, projectSourceOntoRuntimeShape } from "./io.write-prepare.js";
import { applyMergePatch } from "./merge-patch.js";
import { getRuntimeConfigSnapshot, getRuntimeConfigSourceSnapshot } from "./runtime-snapshot.js";
import type { RemoteClawConfig } from "./types.js";

function isCompatibleTopLevelRuntimeProjectionShape(params: {
  runtimeSnapshot: RemoteClawConfig;
  candidate: RemoteClawConfig;
}): boolean {
  const runtime = params.runtimeSnapshot as Record<string, unknown>;
  const candidate = params.candidate as Record<string, unknown>;
  for (const key of Object.keys(runtime)) {
    if (!Object.hasOwn(candidate, key)) {
      return false;
    }
    const runtimeValue = runtime[key];
    const candidateValue = candidate[key];
    const runtimeType = Array.isArray(runtimeValue)
      ? "array"
      : runtimeValue === null
        ? "null"
        : typeof runtimeValue;
    const candidateType = Array.isArray(candidateValue)
      ? "array"
      : candidateValue === null
        ? "null"
        : typeof candidateValue;
    if (runtimeType !== candidateType) {
      return false;
    }
  }
  return true;
}

/** Projects a runtime-derived config back onto the active authored source snapshot. */
export function projectConfigOntoRuntimeSourceSnapshot(config: RemoteClawConfig): RemoteClawConfig {
  const runtimeConfigSnapshot = getRuntimeConfigSnapshot();
  const runtimeConfigSourceSnapshot = getRuntimeConfigSourceSnapshot();
  if (!runtimeConfigSnapshot || !runtimeConfigSourceSnapshot) {
    return config;
  }
  if (config === runtimeConfigSnapshot) {
    return runtimeConfigSourceSnapshot;
  }
  if (
    !isCompatibleTopLevelRuntimeProjectionShape({
      runtimeSnapshot: runtimeConfigSnapshot,
      candidate: config,
    })
  ) {
    return config;
  }
  const projectedSource = projectSourceOntoRuntimeShape(
    runtimeConfigSourceSnapshot,
    runtimeConfigSnapshot,
  ) as RemoteClawConfig;
  const runtimePatch = createMergePatch(runtimeConfigSnapshot, config);
  return applyMergePatch(projectedSource, runtimePatch) as RemoteClawConfig;
}
