import type { AgentAcpBinding, AgentBinding, AgentRouteBinding } from "./types.agents.js";
import type { RemoteClawConfig } from "./types.remoteclaw.js";

export type ConfiguredBindingRule = AgentBinding;

function normalizeBindingType(binding: AgentBinding): "route" | "acp" {
  return binding.type === "acp" ? "acp" : "route";
}

export function isRouteBinding(binding: AgentBinding): binding is AgentRouteBinding {
  return normalizeBindingType(binding) === "route";
}

export function isAcpBinding(binding: AgentBinding): binding is AgentAcpBinding {
  return normalizeBindingType(binding) === "acp";
}

export function listConfiguredBindings(cfg: RemoteClawConfig): AgentBinding[] {
  return Array.isArray(cfg.bindings) ? cfg.bindings : [];
}

export function listRouteBindings(cfg: RemoteClawConfig): AgentRouteBinding[] {
  return listConfiguredBindings(cfg).filter(isRouteBinding);
}

export function listAcpBindings(cfg: RemoteClawConfig): AgentAcpBinding[] {
  return listConfiguredBindings(cfg).filter(isAcpBinding);
}
