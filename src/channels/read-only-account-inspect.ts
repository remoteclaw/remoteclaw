import type { RemoteClawConfig } from "../config/config.js";
import { getChannelPlugin } from "./plugins/registry.js";
import type { ChannelId } from "./plugins/types.js";

export type ReadOnlyInspectedAccount = Record<string, unknown>;

/**
 * Resolve a channel's account information for inspection without side effects.
 *
 * Read-only by construction: it only invokes the channel plugin's
 * `config.inspectAccount` reader — never a mutator (`setAccountEnabled`,
 * `resolveAccount`, etc.) — and performs no writes or state mutation. Returns
 * `null` when the channel is not registered or exposes no inspector.
 *
 * Adapted for the RemoteClaw fork: channel plugins are resolved through the
 * active registry via `getChannelPlugin`. Upstream additionally falls back to a
 * bundled channel lazy-loader; the fork gutted that loader, so the active
 * registry is the single resolution seam.
 */
export async function inspectReadOnlyChannelAccount(params: {
  channelId: ChannelId;
  cfg: RemoteClawConfig;
  accountId?: string | null;
}): Promise<ReadOnlyInspectedAccount | null> {
  const inspectAccount = getChannelPlugin(params.channelId)?.config.inspectAccount;
  if (!inspectAccount) {
    return null;
  }
  return (await Promise.resolve(
    inspectAccount(params.cfg, params.accountId),
  )) as ReadOnlyInspectedAccount | null;
}
