// Fixture: the known-positive this gate is REQUIRED to fail on.
//
// Identical to the `resolves` fixture, except that four gutted-subsystem docs
// targets are restored. All four are real residue that a real `gut(ui)` wave
// removed, so this is a re-introduced defect rather than an invented one:
//
//   - "/skill-workshop", "/models", "/sandbox" — three of the 13 shortlinks
//     #3157 dropped, naming the skills marketplace, the model-provider catalog,
//     and the agent sandbox, all gutted in this fork.
//   - "clawhub" — the skills-marketplace root segment.
//
// "/sandbox" is load-bearing in this fixture: `resolveEmbedSandbox` and
// `ControlUiEmbedSandboxMode` below are the live iframe-sandbox homographs, and
// they sit in the same file. A gate that fires on the shortlink while staying
// silent on the identifiers is reading targets, not words. A gate that fires on
// both, or on neither, is broken in one of the two directions #3160 named.
//
// If this fixture ever stops failing the gate, the gate has stopped working —
// that is what `check-control-ui-docs-affordances.test.ts` asserts.
const DOCS_ROOT_SEGMENTS = new Set(["web", "clawhub"]);

const DOCS_SHORTLINK_PATHS = new Set([
  "/control-ui",
  "/web/dashboard",
  "/models",
  "/sandbox",
  "/skill-workshop",
]);

export function resolveEmbedSandbox() {
  return "allow-scripts allow-same-origin";
}

export type ControlUiEmbedSandboxMode = "strict" | "relaxed";

export const ELEVATED_SURFACE_CLASS = "bg-elevated";

export const runtimeStatus = { provider: "cli", model: "default", thinking: "off" };

export { DOCS_ROOT_SEGMENTS, DOCS_SHORTLINK_PATHS };
