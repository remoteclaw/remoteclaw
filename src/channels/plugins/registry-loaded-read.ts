import { getActivePluginRegistry } from "../../plugins/runtime.js";
import { normalizeOptionalString } from "../../shared/string-coerce.js";
import { getChannelPlugin } from "./registry.js";
import type { ChannelId } from "./types.js";
import type { ChannelPlugin } from "./types.plugin.js";

/**
 * Resolve a loaded channel plugin by id for read-only consumers (outbound
 * target resolution, etc.).
 *
 * Fork divergence: upstream reads from `runtime-channel-state.ts`, but in
 * RemoteClaw that module (and `runtime-state.ts`) is orphaned upstream-compat
 * carryover — nothing populates its `state.channel.registry` /
 * `state.activeRegistry` fields. The fork's live plugin registry is owned by
 * `runtime.ts` (`getActivePluginRegistry`). We therefore adopt the upstream
 * KEEP-layer behavior — look up a loaded channel plugin by id from the active
 * registry — against the registry the fork actually populates, preserving the
 * pre-refactor `tryResolveLoadedOutboundTarget` runtime semantics.
 */
export function getLoadedChannelPluginForRead(id: ChannelId): ChannelPlugin | undefined {
  const resolvedId = normalizeOptionalString(id) ?? "";
  if (!resolvedId) {
    return undefined;
  }

  const current = getChannelPlugin(resolvedId);
  if (current) {
    return current;
  }

  const registry = getActivePluginRegistry();
  if (!registry || !Array.isArray(registry.channels)) {
    return undefined;
  }
  for (const entry of registry.channels) {
    const plugin = entry?.plugin;
    if (plugin?.id === resolvedId) {
      return plugin;
    }
  }
  return undefined;
}
