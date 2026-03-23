// Stub: gutted upstream ACP control-plane manager — RemoteClaw does not use ACP.

import type { RemoteClawConfig } from "../../config/types.remoteclaw.js";

export type AcpSessionManager = {
  cancelSession: (params: {
    cfg: RemoteClawConfig;
    sessionKey: string;
    reason: string;
  }) => Promise<void>;
  closeSession: (params: {
    cfg: RemoteClawConfig;
    sessionKey: string;
    reason: string;
    requireAcpSession?: boolean;
    allowBackendUnavailable?: boolean;
  }) => Promise<void>;
};

const noopManager: AcpSessionManager = {
  cancelSession: async () => {},
  closeSession: async () => {},
};

export function getAcpSessionManager(): AcpSessionManager {
  return noopManager;
}
