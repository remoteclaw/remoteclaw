/** Public hook handler alias exposed to bundled/workspace hook modules. */
export type HookHandler = import("./internal-hook-types.js").InternalHookHandler;

/** Public hook API facade for hook modules that should not import internals directly. */
export type { AgentBootstrapHookContext } from "./internal-hooks.js";
export {
  registerInternalHook as registerHook,
  unregisterInternalHook as unregisterHook,
  clearInternalHooks as clearHooks,
  getRegisteredEventKeys as getRegisteredHookEventKeys,
  triggerInternalHook as triggerHook,
  createInternalHookEvent as createHookEvent,
} from "./internal-hooks.js";
