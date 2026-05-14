/**
 * Runtime attestation (ADR 0005 H9). Declares the implementation status
 * of each runtime export in this module. See CONTRIBUTING.md § Module
 * attestations for the category definitions and the convention for
 * updating these when sync or rebrand changes the surface.
 */
export const MODULE_ATTESTATIONS = {
  resetModelsJsonReadyCacheForTest: "live",
} as const;

const MODELS_JSON_STATE_KEY = Symbol.for("remoteclaw.modelsJsonState");

type ModelsJsonState = {
  writeLocks: Map<string, Promise<void>>;
  readyCache: Map<
    string,
    Promise<{ fingerprint: string; result: { agentDir: string; wrote: boolean } }>
  >;
};

export const MODELS_JSON_STATE = (() => {
  const globalState = globalThis as typeof globalThis & {
    [MODELS_JSON_STATE_KEY]?: ModelsJsonState;
  };
  if (!globalState[MODELS_JSON_STATE_KEY]) {
    globalState[MODELS_JSON_STATE_KEY] = {
      writeLocks: new Map<string, Promise<void>>(),
      readyCache: new Map<
        string,
        Promise<{ fingerprint: string; result: { agentDir: string; wrote: boolean } }>
      >(),
    };
  }
  return globalState[MODELS_JSON_STATE_KEY];
})();

export function resetModelsJsonReadyCacheForTest(): void {
  MODELS_JSON_STATE.readyCache.clear();
}
