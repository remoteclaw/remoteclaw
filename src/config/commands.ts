import { getChannelPlugin, normalizeChannelId } from "../channels/plugins/index.js";
import type { ChannelId } from "../channels/plugins/types.js";
import { isPlainObject } from "../infra/plain-object.js";
import type { CommandsConfig, NativeCommandsSetting } from "./types.js";

export type CommandFlagKey = {
  [K in keyof CommandsConfig]-?: Exclude<CommandsConfig[K], undefined> extends boolean ? K : never;
}[keyof CommandsConfig];

function resolveAutoDefault(
  providerId: ChannelId | undefined,
  kind: "native" | "nativeSkills",
): boolean {
  const id = normalizeChannelId(providerId);
  if (!id) {
    return false;
  }
  const plugin = getChannelPlugin(id);
  const flagValue =
    kind === "native"
      ? plugin?.commands?.nativeCommandsAutoEnabled
      : plugin?.commands?.nativeSkillsAutoEnabled;
  if (typeof flagValue === "boolean") {
    return flagValue;
  }
  // Fork fallback: upstream relies on every chat-channel plugin declaring its
  // auto-enable flags and on the plugin registry always being bootstrapped.
  // RemoteClaw paths such as the security audit (audit-channel.ts) resolve
  // native command/skill defaults without loading a registry, and the bundled
  // discord/telegram plugins do not (yet) declare these flags — so preserve the
  // historical built-in defaults when the registry is silent on this channel.
  return id === "discord" || id === "telegram";
}

export function resolveNativeSkillsEnabled(params: {
  providerId: ChannelId;
  providerSetting?: NativeCommandsSetting;
  globalSetting?: NativeCommandsSetting;
}): boolean {
  return resolveNativeCommandSetting({ ...params, kind: "nativeSkills" });
}

export function resolveNativeCommandsEnabled(params: {
  providerId: ChannelId;
  providerSetting?: NativeCommandsSetting;
  globalSetting?: NativeCommandsSetting;
}): boolean {
  return resolveNativeCommandSetting({ ...params, kind: "native" });
}

function resolveNativeCommandSetting(params: {
  providerId: ChannelId;
  providerSetting?: NativeCommandsSetting;
  globalSetting?: NativeCommandsSetting;
  kind: "native" | "nativeSkills";
}): boolean {
  const { providerId, providerSetting, globalSetting, kind } = params;
  const setting = providerSetting === undefined ? globalSetting : providerSetting;
  if (setting === true) {
    return true;
  }
  if (setting === false) {
    return false;
  }
  return resolveAutoDefault(providerId, kind);
}

export function isNativeCommandsExplicitlyDisabled(params: {
  providerSetting?: NativeCommandsSetting;
  globalSetting?: NativeCommandsSetting;
}): boolean {
  const { providerSetting, globalSetting } = params;
  if (providerSetting === false) {
    return true;
  }
  if (providerSetting === undefined) {
    return globalSetting === false;
  }
  return false;
}

function getOwnCommandFlagValue(
  config: { commands?: unknown } | undefined,
  key: CommandFlagKey,
): unknown {
  const { commands } = config ?? {};
  if (!isPlainObject(commands) || !Object.hasOwn(commands, key)) {
    return undefined;
  }
  return commands[key];
}

export function isCommandFlagEnabled(
  config: { commands?: unknown } | undefined,
  key: CommandFlagKey,
): boolean {
  return getOwnCommandFlagValue(config, key) === true;
}

export function isRestartEnabled(config?: { commands?: unknown }): boolean {
  return getOwnCommandFlagValue(config, "restart") !== false;
}
