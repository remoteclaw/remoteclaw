// TODO(gut): DEFAULT_PROVIDER and DEFAULT_MODEL are OpenClaw remnants from its
// model-management system.  RemoteClaw does not control which model a CLI
// runtime uses — the CLI owns model selection.  These constants (and the
// `agents.*.model` config fields they back) need to be fully gutted.
// The only "provider" concept RemoteClaw owns is the CLI runtime name
// ("claude", "gemini", …), handled by resolveCliRuntimeProvider().
/** @deprecated OpenClaw remnant — will be removed with model-config gutting. */
export const DEFAULT_PROVIDER = "anthropic";
/** @deprecated OpenClaw remnant — will be removed with model-config gutting. */
export const DEFAULT_MODEL = "claude-opus-4-6";
// Conservative fallback used when model metadata is unavailable.
export const DEFAULT_CONTEXT_TOKENS = 200_000;
