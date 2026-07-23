// Guards config writes that are disallowed in Nix-managed installs.
import { resolveIsNixMode } from "./paths.js";

/** Agent-first Nix install docs shown when runtime config writes are blocked. */
export const NIX_REMOTECLAW_AGENT_FIRST_URL =
  "https://github.com/remoteclaw/nix-remoteclaw#quick-start";
/** Public RemoteClaw Nix overview shown with immutable-config errors. */
export const REMOTECLAW_NIX_OVERVIEW_URL = "https://docs.remoteclaw.org/install/nix";

/** Error thrown when a mutating config path is attempted while Nix owns config state. */
export class NixModeConfigMutationError extends Error {
  readonly code = "REMOTECLAW_NIX_MODE_CONFIG_IMMUTABLE";

  constructor(params: { configPath?: string } = {}) {
    super(formatNixModeConfigMutationMessage(params));
    this.name = "NixModeConfigMutationError";
  }
}

/** Build the operator-facing immutable-config message for Nix-managed installs. */
export function formatNixModeConfigMutationMessage(params: { configPath?: string } = {}): string {
  return [
    "Config is managed by Nix (`REMOTECLAW_NIX_MODE=1`), so RemoteClaw treats remoteclaw.json as immutable.",
    "This usually means nix-remoteclaw, the first-party Nix distribution, or another Nix-managed package set this mode.",
    ...(params.configPath ? [`Config path: ${params.configPath}`] : []),
    "Do not run setup, onboarding, remoteclaw update, plugin install/update/uninstall/enable, doctor repair/token-generation, or config set against this file.",
    "Edit the Nix source for this install instead. For nix-remoteclaw, edit `programs.remoteclaw.config` or `instances.<name>.config`, then rebuild with Home Manager or NixOS.",
    `Agent-first Nix setup: ${NIX_REMOTECLAW_AGENT_FIRST_URL}`,
    `RemoteClaw Nix overview: ${REMOTECLAW_NIX_OVERVIEW_URL}`,
  ].join("\n");
}

/** Throw when the current environment marks RemoteClaw config as Nix-managed and immutable. */
export function assertConfigWriteAllowedInCurrentMode(
  params: {
    configPath?: string;
    env?: NodeJS.ProcessEnv;
  } = {},
): void {
  if (!resolveIsNixMode(params.env)) {
    return;
  }
  // In Nix mode, all writes must happen in the declarative source and then rebuild.
  throw new NixModeConfigMutationError({ configPath: params.configPath });
}
