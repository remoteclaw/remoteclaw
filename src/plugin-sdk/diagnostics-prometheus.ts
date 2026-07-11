// Narrow plugin-sdk surface for the bundled diagnostics-prometheus plugin.
// Keep this list additive and scoped to the bundled diagnostics-prometheus surface.

export type { DiagnosticEventPayload } from "../infra/diagnostic-events.js";
export { emitDiagnosticEvent, onInternalDiagnosticEvent } from "../infra/diagnostic-events.js";
export { redactSensitiveText } from "../logging/redact.js";
export { emptyPluginConfigSchema } from "../plugins/config-schema.js";
export type {
  RemoteClawPluginApi,
  RemoteClawPluginHttpRouteHandler,
  RemoteClawPluginService,
  RemoteClawPluginServiceContext,
} from "../plugins/types.js";
