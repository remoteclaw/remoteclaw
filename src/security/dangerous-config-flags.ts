import type { RemoteClawConfig } from "../config/config.js";

export function collectEnabledInsecureOrDangerousFlags(cfg: RemoteClawConfig): string[] {
  const enabledFlags: string[] = [];
  if (cfg.gateway?.controlUi?.allowInsecureAuth === true) {
    enabledFlags.push("gateway.controlUi.allowInsecureAuth=true");
  }
  if (cfg.gateway?.controlUi?.dangerouslyAllowHostHeaderOriginFallback === true) {
    enabledFlags.push("gateway.controlUi.dangerouslyAllowHostHeaderOriginFallback=true");
  }
  if (cfg.gateway?.controlUi?.dangerouslyDisableDeviceAuth === true) {
    enabledFlags.push("gateway.controlUi.dangerouslyDisableDeviceAuth=true");
  }
  if (Array.isArray(cfg.hooks?.mappings)) {
    for (const [index, mapping] of cfg.hooks.mappings.entries()) {
      if (mapping?.allowUnsafeExternalContent === true) {
        enabledFlags.push(`hooks.mappings[${index}].allowUnsafeExternalContent=true`);
      }
    }
  }
  if (cfg.tools?.exec?.applyPatch?.workspaceOnly === false) {
    enabledFlags.push("tools.exec.applyPatch.workspaceOnly=false");
  }
  if (
    (cfg.plugins as Record<string, unknown> | undefined)?.entries &&
    typeof (cfg.plugins as Record<string, unknown>).entries === "object" &&
    ((cfg.plugins as Record<string, unknown>).entries as Record<string, unknown>)?.acpx &&
    typeof (
      ((cfg.plugins as Record<string, unknown>).entries as Record<string, unknown>).acpx as Record<
        string,
        unknown
      >
    )?.config === "object" &&
    (
      (
        ((cfg.plugins as Record<string, unknown>).entries as Record<string, unknown>)
          .acpx as Record<string, unknown>
      ).config as Record<string, unknown>
    )?.permissionMode === "approve-all"
  ) {
    enabledFlags.push("plugins.entries.acpx.config.permissionMode=approve-all");
  }
  return enabledFlags;
}
