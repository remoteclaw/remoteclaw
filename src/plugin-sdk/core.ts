export type {
  AnyAgentTool,
  RemoteClawPluginApi,
  RemoteClawPluginService,
  ProviderAuthContext,
  ProviderAuthResult,
} from "../plugins/types.js";
export type { ChannelPlugin } from "../channels/plugins/types.plugin.js";
export type { PluginRuntime } from "../plugins/runtime/types.js";
export type { RemoteClawConfig } from "../config/config.js";
export type { GatewayRequestHandlerOptions } from "../gateway/server-methods/types.js";

export { emptyPluginConfigSchema } from "../plugins/config-schema.js";

export { approveDevicePairing, listDevicePairing, rejectDevicePairing } from "../infra/device-pairing.js";

export {
  runPluginCommandWithTimeout,
  type PluginCommandRunOptions,
  type PluginCommandRunResult,
} from "./run-command.js";
export { resolvePreferredRemoteClawTmpDir } from "../infra/tmp-remoteclaw-dir.js";

export {
  DEFAULT_SECRET_FILE_MAX_BYTES,
  loadSecretFileSync,
  readSecretFileSync,
  tryReadSecretFileSync,
} from "../infra/secret-file.js";
export type { SecretFileReadOptions, SecretFileReadResult } from "../infra/secret-file.js";

export { resolveGatewayBindUrl } from "../shared/gateway-bind-url.js";
export type { GatewayBindUrlResult } from "../shared/gateway-bind-url.js";

export { resolveTailnetHostWithRunner } from "../shared/tailscale-status.js";
export type { TailscaleStatusCommandResult, TailscaleStatusCommandRunner } from "../shared/tailscale-status.js";
