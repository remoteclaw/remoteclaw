import type { GroupPolicy } from "./types.base.js";
import type { ChannelBotLoopProtectionConfig } from "./types.bot-loop-protection.js";

export type ChannelHeartbeatVisibilityConfig = {
  /** Show HEARTBEAT_OK acknowledgments in chat (default: false). */
  showOk?: boolean;
  /** Show heartbeat alerts with actual content (default: true). */
  showAlerts?: boolean;
  /** Emit indicator events for UI status display (default: true). */
  useIndicator?: boolean;
};

export type ChannelHealthMonitorConfig = {
  /**
   * Enable channel-health-monitor restarts for this channel or account.
   * Inherits the global gateway setting when omitted.
   */
  enabled?: boolean;
};

export type ChannelDefaultsConfig = {
  groupPolicy?: GroupPolicy;
  /** Default heartbeat visibility for all channels. */
  heartbeat?: ChannelHeartbeatVisibilityConfig;
  /** Default bot-to-bot loop protection for channels that support it. */
  botLoopProtection?: ChannelBotLoopProtectionConfig;
};

export type ChannelModelByChannelConfig = Record<string, Record<string, string>>;

/**
 * Base type for extension channel config sections.
 * Extensions can use this as a starting point for their channel config.
 */
export type ExtensionChannelConfig = {
  enabled?: boolean;
  allowFrom?: string | string[];
  /** Default delivery target for CLI --deliver when no explicit --reply-to is provided. */
  defaultTo?: string;
  /** Optional default account id when multiple accounts are configured. */
  defaultAccount?: string;
  dmPolicy?: string;
  groupPolicy?: GroupPolicy;
  healthMonitor?: ChannelHealthMonitorConfig;
  accounts?: Record<string, unknown>;
  [key: string]: unknown;
};

export interface ChannelsConfig {
  defaults?: ChannelDefaultsConfig;
  /** Map provider -> channel id / DM peer id -> model override. See docs/gateway/config-channels.md for supported key forms. */
  modelByChannel?: ChannelModelByChannelConfig;
  /** Channel sections are plugin-owned; concrete channel files augment this interface. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}
