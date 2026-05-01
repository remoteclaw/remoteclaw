// Narrow plugin-sdk surface for the bundled copilot-proxy plugin.
// Keep this list additive and scoped to the bundled Copilot proxy surface.

export { emptyPluginConfigSchema } from "../plugins/config-schema.js";
export type { RemoteClawPluginApi, ProviderAuthContext, ProviderAuthResult } from "../plugins/types.js";
