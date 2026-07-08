export {
  buildCommandTextFromArgs,
  findCommandByNativeName,
  listNativeCommandSpecs,
  listNativeCommandSpecsForConfig,
  maybeResolveTextAlias,
  normalizeCommandBody,
  parseCommandArgs,
  serializeCommandArgs,
  resolveCommandArgMenu,
} from "../auto-reply/commands-registry.js";
export type {
  ChatCommandDefinition,
  CommandArgDefinition,
  CommandArgValues,
  CommandArgs,
  NativeCommandSpec,
} from "../auto-reply/commands-registry.js";
export {
  hasControlCommand,
  shouldComputeCommandAuthorized,
} from "../auto-reply/command-detection.js";
export {
  resolveCommandAuthorizedFromAuthorizers,
  resolveControlCommandGate,
} from "../channels/command-gating.js";
export { resolveNativeCommandSessionTargets } from "../channels/native-command-session-targets.js";
export {
  resolveCommandAuthorization,
  type CommandAuthorization,
} from "../auto-reply/command-auth.js";
