import { normalizeOptionalString } from "@remoteclaw/normalization-core/string-coerce";
import type { RemoteClawConfig } from "../config/types.remoteclaw.js";

export type GatewayProbeTargetResolution = {
  gatewayMode: "local" | "remote";
  mode: "local" | "remote";
  remoteUrlMissing: boolean;
};

export function resolveGatewayProbeTarget(cfg: RemoteClawConfig): GatewayProbeTargetResolution {
  const gatewayMode = cfg.gateway?.mode === "remote" ? "remote" : "local";
  const remoteUrlRaw = normalizeOptionalString(cfg.gateway?.remote?.url) ?? "";
  const remoteUrlMissing = gatewayMode === "remote" && !remoteUrlRaw;
  return {
    gatewayMode,
    mode: gatewayMode === "remote" && !remoteUrlMissing ? "remote" : "local",
    remoteUrlMissing,
  };
}
