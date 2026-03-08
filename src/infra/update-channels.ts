export type UpdateChannel = "stable" | "beta" | "next";
export type UpdateChannelSource = "config" | "default";

export const DEFAULT_PACKAGE_CHANNEL: UpdateChannel = "next";

export function normalizeUpdateChannel(value?: string | null): UpdateChannel | null {
  if (!value) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "stable" || normalized === "beta" || normalized === "next") {
    return normalized;
  }
  // Backward compat: "dev" → "next"
  if (normalized === "dev") {
    return "next";
  }
  return null;
}

export function channelToNpmTag(channel: UpdateChannel): string {
  if (channel === "beta") {
    return "beta";
  }
  if (channel === "next") {
    return "next";
  }
  return "latest";
}

export function resolveEffectiveUpdateChannel(params: { configChannel?: UpdateChannel | null }): {
  channel: UpdateChannel;
  source: UpdateChannelSource;
} {
  if (params.configChannel) {
    return { channel: params.configChannel, source: "config" };
  }

  return { channel: DEFAULT_PACKAGE_CHANNEL, source: "default" };
}

export function formatUpdateChannelLabel(params: {
  channel: UpdateChannel;
  source: UpdateChannelSource;
}): string {
  if (params.source === "config") {
    return `${params.channel} (config)`;
  }
  return `${params.channel} (default)`;
}

export function resolveUpdateChannelDisplay(params: { configChannel?: UpdateChannel | null }): {
  channel: UpdateChannel;
  source: UpdateChannelSource;
  label: string;
} {
  const channelInfo = resolveEffectiveUpdateChannel({
    configChannel: params.configChannel,
  });
  return {
    channel: channelInfo.channel,
    source: channelInfo.source,
    label: formatUpdateChannelLabel({
      channel: channelInfo.channel,
      source: channelInfo.source,
    }),
  };
}
