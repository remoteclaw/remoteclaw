import {
  buildCommandTextFromArgs as buildCommandTextFromArgsImpl,
  findCommandByNativeName as findCommandByNativeNameImpl,
  listNativeCommandSpecsForConfig as listNativeCommandSpecsForConfigImpl,
  parseCommandArgs as parseCommandArgsImpl,
  resolveCommandArgMenu as resolveCommandArgMenuImpl,
} from "remoteclaw/plugin-sdk/reply-runtime";

type BuildCommandTextFromArgs =
  typeof import("remoteclaw/plugin-sdk/reply-runtime").buildCommandTextFromArgs;
type FindCommandByNativeName =
  typeof import("remoteclaw/plugin-sdk/reply-runtime").findCommandByNativeName;
type ListNativeCommandSpecsForConfig =
  typeof import("remoteclaw/plugin-sdk/reply-runtime").listNativeCommandSpecsForConfig;
type ParseCommandArgs = typeof import("remoteclaw/plugin-sdk/reply-runtime").parseCommandArgs;
type ResolveCommandArgMenu =
  typeof import("remoteclaw/plugin-sdk/reply-runtime").resolveCommandArgMenu;

export function buildCommandTextFromArgs(
  ...args: Parameters<BuildCommandTextFromArgs>
): ReturnType<BuildCommandTextFromArgs> {
  return buildCommandTextFromArgsImpl(...args);
}

export function findCommandByNativeName(
  ...args: Parameters<FindCommandByNativeName>
): ReturnType<FindCommandByNativeName> {
  return findCommandByNativeNameImpl(...args);
}

export function listNativeCommandSpecsForConfig(
  ...args: Parameters<ListNativeCommandSpecsForConfig>
): ReturnType<ListNativeCommandSpecsForConfig> {
  return listNativeCommandSpecsForConfigImpl(...args);
}

export function parseCommandArgs(
  ...args: Parameters<ParseCommandArgs>
): ReturnType<ParseCommandArgs> {
  return parseCommandArgsImpl(...args);
}

export function resolveCommandArgMenu(
  ...args: Parameters<ResolveCommandArgMenu>
): ReturnType<ResolveCommandArgMenu> {
  return resolveCommandArgMenuImpl(...args);
}
