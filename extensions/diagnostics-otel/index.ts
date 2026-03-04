import type { OpenClawPluginApi } from "remoteclaw/plugin-sdk/diagnostics-otel";
import { emptyPluginConfigSchema } from "remoteclaw/plugin-sdk/diagnostics-otel";
import { createDiagnosticsOtelService } from "./src/service.js";

const plugin = {
  id: "diagnostics-otel",
  name: "Diagnostics OpenTelemetry",
  description: "Export diagnostics events to OpenTelemetry",
  configSchema: emptyPluginConfigSchema(),
  register(api: RemoteClawPluginApi) {
    api.registerService(createDiagnosticsOtelService());
  },
};

export default plugin;
