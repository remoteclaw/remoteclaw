import { discordPlugin } from "../../../extensions/discord/src/channel.js";
import { imessagePlugin } from "../../../extensions/imessage/src/channel.js";
import { signalPlugin } from "../../../extensions/signal/src/channel.js";
import { slackPlugin } from "../../../extensions/slack/src/channel.js";
import { telegramPlugin } from "../../../extensions/telegram/src/channel.js";
import { whatsappOnboardingAdapter } from "../../../extensions/whatsapp/src/onboarding.js";
import { listChannelSetupPlugins } from "../../channels/plugins/setup-registry.js";
import { buildChannelOnboardingAdapterFromSetupWizard } from "../../channels/plugins/setup-wizard.js";
import type { ChannelChoice } from "../onboard-types.js";
import type { ChannelOnboardingAdapter } from "./types.js";

const telegramOnboardingAdapter = buildChannelOnboardingAdapterFromSetupWizard({
  plugin: telegramPlugin,
  wizard: telegramPlugin.setupWizard!,
});
const discordOnboardingAdapter = buildChannelOnboardingAdapterFromSetupWizard({
  plugin: discordPlugin,
  wizard: discordPlugin.setupWizard!,
});
const slackOnboardingAdapter = buildChannelOnboardingAdapterFromSetupWizard({
  plugin: slackPlugin,
  wizard: slackPlugin.setupWizard!,
});
const signalOnboardingAdapter = buildChannelOnboardingAdapterFromSetupWizard({
  plugin: signalPlugin,
  wizard: signalPlugin.setupWizard!,
});
const imessageOnboardingAdapter = buildChannelOnboardingAdapterFromSetupWizard({
  plugin: imessagePlugin,
  wizard: imessagePlugin.setupWizard!,
});

const BUILTIN_ONBOARDING_ADAPTERS: ChannelOnboardingAdapter[] = [
  telegramOnboardingAdapter,
  whatsappOnboardingAdapter,
  discordOnboardingAdapter,
  slackOnboardingAdapter,
  signalOnboardingAdapter,
  imessageOnboardingAdapter,
];

const CHANNEL_ONBOARDING_ADAPTERS = () => {
  const fromRegistry = listChannelPlugins()
    .map((plugin) => (plugin.onboarding ? ([plugin.id, plugin.onboarding] as const) : null))
    .filter((entry): entry is readonly [ChannelChoice, ChannelOnboardingAdapter] => Boolean(entry));

  // Fall back to built-in adapters to keep onboarding working even when the plugin registry
  // fails to populate (see #25545).
  const fromBuiltins = BUILTIN_ONBOARDING_ADAPTERS.map(
    (adapter) => [adapter.channel, adapter] as const,
  );

  return new Map<ChannelChoice, ChannelOnboardingAdapter>([...fromBuiltins, ...fromRegistry]);
};

export function getChannelOnboardingAdapter(
  channel: ChannelChoice,
): ChannelOnboardingAdapter | undefined {
  return CHANNEL_ONBOARDING_ADAPTERS().get(channel);
}

export function listChannelOnboardingAdapters(): ChannelOnboardingAdapter[] {
  return Array.from(CHANNEL_ONBOARDING_ADAPTERS().values());
}

// Legacy aliases (pre-rename).
export const getProviderOnboardingAdapter = getChannelOnboardingAdapter;
export const listProviderOnboardingAdapters = listChannelOnboardingAdapters;
