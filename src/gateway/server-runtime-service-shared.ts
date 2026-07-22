import type { RemoteClawConfig } from "../config/types.remoteclaw.js";
import type { HeartbeatRunner } from "../infra/heartbeat-runner.js";

export type GatewayRuntimeServiceLogger = {
  child: (name: string) => {
    info: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string) => void;
  };
  error: (message: string) => void;
};

export function createNoopHeartbeatRunner(): HeartbeatRunner {
  return {
    stop: () => {},
    updateConfig: (_cfg: RemoteClawConfig) => {},
  };
}
