import type { RemoteClawConfig } from "../../config/types.remoteclaw.js";
import type { DeliverableMessageChannel } from "../../utils/message-channel.js";

export function resetOutboundChannelBootstrapStateForTests(): void {
  // Runtime channel plugins are loaded during Gateway startup now.
}

export function bootstrapOutboundChannelPlugin(params: {
  channel: DeliverableMessageChannel;
  cfg?: RemoteClawConfig;
}): void {
  void params;
}
