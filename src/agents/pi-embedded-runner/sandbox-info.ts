import type { ExecElevatedDefaults } from "../bash-tools.js";
import type { EmbeddedSandboxInfo } from "./types.js";

// Sandbox infrastructure removed (#68); this file is deleted when pi-embedded-runner is gutted.
type SandboxContextResult = {
  enabled?: boolean;
  workspaceDir?: string;
  containerWorkdir?: string;
  workspaceAccess?: "none" | "ro" | "rw";
  browser?: { bridgeUrl?: string; noVncUrl?: string };
  browserAllowHostControl?: boolean;
};

export function buildEmbeddedSandboxInfo(
  sandbox?: SandboxContextResult,
  execElevated?: ExecElevatedDefaults,
): EmbeddedSandboxInfo | undefined {
  if (!sandbox?.enabled) {
    return undefined;
  }
  const elevatedAllowed = Boolean(execElevated?.enabled && execElevated.allowed);
  return {
    enabled: true,
    workspaceDir: sandbox.workspaceDir,
    containerWorkspaceDir: sandbox.containerWorkdir,
    workspaceAccess: sandbox.workspaceAccess,
    agentWorkspaceMount: sandbox.workspaceAccess === "ro" ? "/agent" : undefined,
    browserBridgeUrl: sandbox.browser?.bridgeUrl,
    browserNoVncUrl: sandbox.browser?.noVncUrl,
    hostBrowserAllowed: sandbox.browserAllowHostControl,
    ...(elevatedAllowed
      ? {
          elevated: {
            allowed: true,
            defaultLevel: execElevated?.defaultLevel ?? "off",
          },
        }
      : {}),
  };
}
