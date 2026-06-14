import type { PluginRegistry } from "./registry.js";

// RemoteClaw fork keeps cli-backend (CLI agents), generic providers, and
// channels. The model-provider capability kinds (speech, realtime-*,
// media-understanding, image-generation, web-search, agent-harness,
// context-engine) were gutted with the provider ecosystem.
export type PluginCapabilityKind = "cli-backend" | "text-inference" | "channel";

export type PluginInspectShape =
  | "hook-only"
  | "plain-capability"
  | "hybrid-capability"
  | "non-capability";

export type PluginCapabilityEntry = {
  kind: PluginCapabilityKind;
  ids: string[];
};

export type PluginShapeSummary = {
  shape: PluginInspectShape;
  capabilityMode: "none" | "plain" | "hybrid";
  capabilityCount: number;
  capabilities: PluginCapabilityEntry[];
  usesLegacyBeforeAgentStart: boolean;
};

export function buildPluginCapabilityEntries(
  plugin: PluginRegistry["plugins"][number],
): PluginCapabilityEntry[] {
  return [
    { kind: "cli-backend" as const, ids: plugin.cliBackendIds ?? [] },
    { kind: "text-inference" as const, ids: plugin.providerIds },
    { kind: "channel" as const, ids: plugin.channelIds },
  ].filter((entry) => entry.ids.length > 0);
}

export function derivePluginInspectShape(params: {
  capabilityCount: number;
  typedHookCount: number;
  customHookCount: number;
  toolCount: number;
  commandCount: number;
  cliCount: number;
  serviceCount: number;
  gatewayMethodCount: number;
  httpRouteCount: number;
}): PluginInspectShape {
  if (params.capabilityCount > 1) {
    return "hybrid-capability";
  }
  if (params.capabilityCount === 1) {
    return "plain-capability";
  }
  const hasOnlyHooks =
    params.typedHookCount + params.customHookCount > 0 &&
    params.toolCount === 0 &&
    params.commandCount === 0 &&
    params.cliCount === 0 &&
    params.serviceCount === 0 &&
    params.gatewayMethodCount === 0 &&
    params.httpRouteCount === 0;
  if (hasOnlyHooks) {
    return "hook-only";
  }
  return "non-capability";
}

export function buildPluginShapeSummary(params: {
  plugin: PluginRegistry["plugins"][number];
  report: Pick<PluginRegistry, "hooks" | "typedHooks" | "tools">;
}): PluginShapeSummary {
  const capabilities = buildPluginCapabilityEntries(params.plugin);
  const typedHookCount = params.report.typedHooks.filter(
    (entry) => entry.pluginId === params.plugin.id,
  ).length;
  const customHookCount = params.report.hooks.filter(
    (entry) => entry.pluginId === params.plugin.id,
  ).length;
  const toolCount = params.report.tools.filter(
    (entry) => entry.pluginId === params.plugin.id,
  ).length;
  const capabilityCount = capabilities.length;
  const shape = derivePluginInspectShape({
    capabilityCount,
    typedHookCount,
    customHookCount,
    toolCount,
    commandCount: params.plugin.commands.length,
    cliCount: params.plugin.cliCommands.length,
    serviceCount: params.plugin.services.length,
    gatewayMethodCount: params.plugin.gatewayMethods.length,
    httpRouteCount: params.plugin.httpRoutes,
  });

  return {
    shape,
    capabilityMode: capabilityCount === 0 ? "none" : capabilityCount === 1 ? "plain" : "hybrid",
    capabilityCount,
    capabilities,
    usesLegacyBeforeAgentStart: params.report.typedHooks.some(
      (entry) => entry.pluginId === params.plugin.id && entry.hookName === "before_agent_start",
    ),
  };
}
