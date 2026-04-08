export type {
  ThreadBindingManager,
  ThreadBindingRecord,
  ThreadBindingTargetKind,
} from "./thread-bindings.types.js";

export {
  formatThreadBindingDurationLabel,
  resolveThreadBindingIntroText,
  resolveThreadBindingThreadName,
} from "./thread-bindings.messages.js";
// Gutted in RemoteClaw fork (Middleware Boundary Principle) — thread-bindings.persona removed
// oxlint-disable-next-line typescript/no-explicit-any
export const resolveThreadBindingPersona = (..._args: unknown[]) => undefined as any;
// oxlint-disable-next-line typescript/no-explicit-any
export const resolveThreadBindingPersonaFromRecord = (..._args: unknown[]) => undefined as any;

export {
  resolveDiscordThreadBindingIdleTimeoutMs,
  resolveDiscordThreadBindingMaxAgeMs,
  resolveThreadBindingsEnabled,
} from "./thread-bindings.config.js";

export {
  isRecentlyUnboundThreadWebhookMessage,
  resolveThreadBindingIdleTimeoutMs,
  resolveThreadBindingInactivityExpiresAt,
  resolveThreadBindingMaxAgeExpiresAt,
  resolveThreadBindingMaxAgeMs,
} from "./thread-bindings.state.js";

export {
  autoBindSpawnedDiscordSubagent,
  listThreadBindingsBySessionKey,
  listThreadBindingsForAccount,
  reconcileAcpThreadBindingsOnStartup,
  setThreadBindingIdleTimeoutBySessionKey,
  setThreadBindingMaxAgeBySessionKey,
  unbindThreadBindingsBySessionKey,
} from "./thread-bindings.lifecycle.js";

export type { AcpThreadBindingReconciliationResult } from "./thread-bindings.lifecycle.js";

export {
  __testing,
  createNoopThreadBindingManager,
  createThreadBindingManager,
  getThreadBindingManager,
} from "./thread-bindings.manager.js";
