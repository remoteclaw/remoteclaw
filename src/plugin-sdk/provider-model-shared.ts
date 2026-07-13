// Fork-local re-export shim: upstream bundled plugins imported provider helpers
// from `openclaw/plugin-sdk/provider-model-shared`. The RemoteClaw fork gutted the
// provider/model catalog; the sole surviving symbol a consumer (the policy ext)
// needs is `normalizeProviderId`, which now lives in `src/agents/provider-utils`.
export { normalizeProviderId } from "../agents/provider-utils.js";
