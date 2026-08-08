// Fixture: every Control UI docs target resolves.
//
// This file deliberately carries the three homographs #3160 named as
// must-not-fire: `resolveEmbedSandbox` / `ControlUiEmbedSandboxMode` (an iframe
// `sandbox` attribute, unrelated to the gutted agent sandbox), the `bg-elevated`
// CSS token, and live `thinking` / `provider` identifiers. None of them is a
// docs target, so a clean run against this fixture is positive evidence that the
// gate reads link targets rather than concept words — the false-positive
// boundary #3160 was most worried about.
const DOCS_ROOT_SEGMENTS = new Set(["web"]);

const DOCS_SHORTLINK_PATHS = new Set(["/control-ui", "/web/dashboard"]);

export function resolveEmbedSandbox() {
  return "allow-scripts allow-same-origin";
}

export type ControlUiEmbedSandboxMode = "strict" | "relaxed";

export const ELEVATED_SURFACE_CLASS = "bg-elevated";

export const runtimeStatus = { provider: "cli", model: "default", thinking: "off" };

export { DOCS_ROOT_SEGMENTS, DOCS_SHORTLINK_PATHS };
