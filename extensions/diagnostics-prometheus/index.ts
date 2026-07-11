import type { RemoteClawPluginApi } from "remoteclaw/plugin-sdk/diagnostics-prometheus";
import { emptyPluginConfigSchema } from "remoteclaw/plugin-sdk/diagnostics-prometheus";
import { createDiagnosticsPrometheusExporter } from "./src/service.js";

const plugin = {
  id: "diagnostics-prometheus",
  name: "Diagnostics Prometheus",
  description: "Expose RemoteClaw diagnostics metrics in Prometheus text format",
  configSchema: emptyPluginConfigSchema(),
  register(api: RemoteClawPluginApi) {
    const exporter = createDiagnosticsPrometheusExporter();
    api.registerService(exporter.service);
    api.registerHttpRoute({
      path: "/api/diagnostics/prometheus",
      auth: "gateway",
      match: "exact",
      handler: exporter.handler,
    });
  },
};

export default plugin;
