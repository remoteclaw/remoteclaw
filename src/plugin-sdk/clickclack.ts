// Narrow plugin-sdk surface for the bundled clickclack plugin.
// Keep this list additive and scoped to symbols used under extensions/clickclack.

export {
  createAccountListHelpers,
  hasConfiguredAccountValue,
  resolveMergedAccountConfig,
} from "../channels/plugins/account-helpers.js";
export { buildChannelConfigSchema } from "../channels/plugins/config-schema.js";
export type { ChannelGatewayContext } from "../channels/plugins/types.adapters.js";
export type { ChannelPlugin } from "../channels/plugins/types.plugin.js";
export {
  resolveStableChannelMessageIngress,
  type StableChannelIngressIdentityParams,
} from "../channels/message-access/index.js";
export type { RemoteClawConfig } from "../config/config.js";
export {
  normalizeResolvedSecretInputString,
  normalizeSecretInputString,
  resolveSecretInputString,
} from "../config/types.secrets.js";
export { dispatchInboundReplyWithBase } from "./inbound-reply-dispatch.js";
export { emptyPluginConfigSchema } from "../plugins/config-schema.js";
export type { RemoteClawPluginApi } from "../plugins/types.js";
export { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "../routing/session-key.js";
export { resolveDefaultSecretProviderAlias } from "../secrets/ref-contract.js";
export {
  buildChannelOutboundSessionRoute,
  buildThreadAwareOutboundSessionRoute,
  createChatChannelPlugin,
} from "./channel-core.js";
// `src/infra/numeric-options.ts` narrows the shared helper to `{ min }` only;
// clickclack's reconnect interval needs the `{ min, max }` form, so re-export
// the normalization-core original rather than widening the infra facade.
export { resolveIntegerOption } from "../../packages/normalization-core/src/number-coercion.js";
export { buildSecretInputSchema } from "./secret-input-schema.js";
export {
  buildComputedAccountStatusSnapshot,
  createDefaultChannelRuntimeState,
} from "./status-helpers.js";
export { normalizeOptionalString } from "./string-coerce-runtime.js";
export { createPluginRuntimeStore, type PluginRuntime } from "./runtime-store.js";
