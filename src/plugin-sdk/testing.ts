// Narrow public testing surface for plugin authors.
// Keep this list additive and limited to helpers we are willing to support.

export { removeAckReactionAfterReply, shouldAckReaction } from "../channels/ack-reactions.js";
// [reconcile] dropped re-export (gutted source: ../channels/plugins/contracts/test-helpers.js)
// [reconcile] dropped re-export (gutted source: ../channels/plugins/contracts/outbound-payload-testkit.js)
// [reconcile] dropped re-export (gutted source: ../channels/plugins/contracts/inbound-testkit.js)
export {
  createCliRuntimeCapture,
  firstWrittenJsonArg,
  spyRuntimeErrors,
  spyRuntimeJson,
  spyRuntimeLogs,
} from "../cli/test-runtime-capture.js";
export type { CliMockOutputRuntime, CliRuntimeCapture } from "../cli/test-runtime-capture.js";
// [reconcile] dropped re-export (gutted source: ../commands/channel-test-registry.js)
export type { ChannelAccountSnapshot } from "../channels/plugins/types.public.js";
export type { ChannelGatewayContext } from "../channels/plugins/types.adapters.js";
export type { RemoteClawConfig } from "../config/config.js";
export { callGateway } from "../gateway/call.js";
export { createEmptyPluginRegistry } from "../plugins/registry.js";
export {
  getActivePluginRegistry,
  resetPluginRuntimeStateForTest,
  setActivePluginRegistry,
} from "../plugins/runtime.js";
// [reconcile] dropped re-export (gutted source: ../plugins/captured-registration.js)
// [reconcile] dropped re-export (gutted source: ../plugins/provider-auth-choice.runtime.js)
export type { PluginRuntime } from "../plugins/runtime/types.js";
export type { RuntimeEnv } from "../runtime.js";
export type { MockFn } from "../test-utils/vitest-mock-fn.js";
// [reconcile] dropped re-export (gutted source: ../media-understanding/audio.test-helpers.ts)
export { isLiveTestEnabled } from "../agents/live-test-helpers.js";
// [reconcile] dropped re-export (gutted source: ../agents/sandbox/test-fixtures.js)
// [reconcile] dropped re-export (gutted source: ../agents/skills.e2e-test-helpers.js)
// [reconcile] dropped re-export (gutted source: ../acp/control-plane/manager.js)
// [reconcile] dropped re-export (gutted source: ../acp/control-plane/manager.js)
// [reconcile] dropped re-export (gutted source: ../acp/runtime/adapter-contract.testkit.js)
// [reconcile] dropped re-export (gutted source: ../auto-reply/reply/commands-acp.js)
// [reconcile] dropped re-export (gutted source: ../auto-reply/reply/commands-spawn.test-harness.js)
export { peekSystemEvents, resetSystemEventsForTest } from "../infra/system-events.js";
// [reconcile] dropped re-export (gutted source: ../test-helpers/http.js)
export { mockPinnedHostnameResolution } from "../test-helpers/ssrf.js";
// [reconcile] dropped re-export (gutted source: ../test-helpers/windows-cmd-shim.js)
// [reconcile] dropped re-export (gutted source: ../test-helpers/resolve-target-error-cases.js)
export { sanitizeTerminalText } from "../terminal/safe-text.js";
export { withStateDirEnv } from "../test-helpers/state-dir-env.js";
export { countLines, hasBalancedFences } from "../test-utils/chunk-test-helpers.js";
export { expectGeneratedTokenPersistedToGatewayAuth } from "../test-utils/auth-token-assertions.js";
export { captureEnv, withEnv, withEnvAsync } from "../test-utils/env.js";
export { withFetchPreconnect, type FetchMock } from "../test-utils/fetch-mock.js";
export { createTempHomeEnv, type TempHomeEnv } from "../test-utils/temp-home.js";
