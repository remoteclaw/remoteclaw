import type { GatewayServiceRuntime } from "../daemon/service-runtime.js";
import type { GatewayService } from "../daemon/service.js";

export type ServiceStatusSummary = {
  label: string;
  installed: boolean | null;
  loaded: boolean;
  managedByRemoteClaw: boolean;
  externallyManaged: boolean;
  loadedText: string;
  runtime: GatewayServiceRuntime | undefined;
};

export async function readServiceStatusSummary(
  service: GatewayService,
  fallbackLabel: string,
): Promise<ServiceStatusSummary> {
  try {
    const command = await service.readCommand(process.env).catch(() => null);
    const serviceEnv = command?.environment
      ? ({
          ...process.env,
          ...command.environment,
        } satisfies NodeJS.ProcessEnv)
      : process.env;
    const [loaded, runtime] = await Promise.all([
      service.isLoaded({ env: serviceEnv }).catch(() => false),
      service.readRuntime(serviceEnv).catch(() => undefined),
    ]);
    const managedByRemoteClaw = command != null;
    const externallyManaged = !managedByRemoteClaw && runtime?.status === "running";
    const installed = managedByRemoteClaw || externallyManaged;
    const loadedText = externallyManaged
      ? "running (externally managed)"
      : loaded
        ? service.loadedText
        : service.notLoadedText;
    return {
      label: service.label,
      installed,
      loaded,
      managedByRemoteClaw,
      externallyManaged,
      loadedText,
      runtime,
    };
  } catch {
    return {
      label: fallbackLabel,
      installed: null,
      loaded: false,
      managedByRemoteClaw: false,
      externallyManaged: false,
      loadedText: "unknown",
      runtime: undefined,
    };
  }
}
