import type { RemoteClawPluginApi } from "remoteclaw/plugin-sdk/core";
import { emptyPluginConfigSchema } from "remoteclaw/plugin-sdk/core";
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
