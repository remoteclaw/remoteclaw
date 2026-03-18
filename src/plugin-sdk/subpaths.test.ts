import * as channelRuntimeSdk from "remoteclaw/plugin-sdk/channel-runtime";
import * as channelSendResultSdk from "remoteclaw/plugin-sdk/channel-send-result";
import * as compatSdk from "remoteclaw/plugin-sdk/compat";
import * as coreSdk from "remoteclaw/plugin-sdk/core";
import type {
  ChannelMessageActionContext as CoreChannelMessageActionContext,
  OpenClawPluginApi as CoreOpenClawPluginApi,
  PluginRuntime as CorePluginRuntime,
} from "remoteclaw/plugin-sdk/core";
import * as directoryRuntimeSdk from "remoteclaw/plugin-sdk/directory-runtime";
import * as discordSdk from "remoteclaw/plugin-sdk/discord";
import * as imessageSdk from "remoteclaw/plugin-sdk/imessage";
import * as lazyRuntimeSdk from "remoteclaw/plugin-sdk/lazy-runtime";
import * as lineSdk from "remoteclaw/plugin-sdk/line";
import * as lineCoreSdk from "remoteclaw/plugin-sdk/line-core";
import * as msteamsSdk from "remoteclaw/plugin-sdk/msteams";
import * as nostrSdk from "remoteclaw/plugin-sdk/nostr";
import * as ollamaSetupSdk from "remoteclaw/plugin-sdk/ollama-setup";
import * as providerSetupSdk from "remoteclaw/plugin-sdk/provider-setup";
import * as replyPayloadSdk from "remoteclaw/plugin-sdk/reply-payload";
import * as routingSdk from "remoteclaw/plugin-sdk/routing";
import * as runtimeSdk from "remoteclaw/plugin-sdk/runtime";
import * as sandboxSdk from "remoteclaw/plugin-sdk/sandbox";
import * as selfHostedProviderSetupSdk from "remoteclaw/plugin-sdk/self-hosted-provider-setup";
import * as setupSdk from "remoteclaw/plugin-sdk/setup";
import * as signalSdk from "remoteclaw/plugin-sdk/signal";
import * as slackSdk from "remoteclaw/plugin-sdk/slack";
import * as telegramSdk from "remoteclaw/plugin-sdk/telegram";
import * as testingSdk from "remoteclaw/plugin-sdk/testing";
import * as voiceCallSdk from "remoteclaw/plugin-sdk/voice-call";
import * as whatsappSdk from "remoteclaw/plugin-sdk/whatsapp";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { ChannelMessageActionContext } from "../channels/plugins/types.js";
import type { PluginRuntime } from "../plugins/runtime/types.js";
import type { OpenClawPluginApi } from "../plugins/types.js";
import type {
  ChannelMessageActionContext as SharedChannelMessageActionContext,
  OpenClawPluginApi as SharedOpenClawPluginApi,
  PluginRuntime as SharedPluginRuntime,
} from "./channel-plugin-common.js";
import { pluginSdkSubpaths } from "./entrypoints.js";

const importPluginSdkSubpath = (specifier: string) => import(/* @vite-ignore */ specifier);

const bundledExtensionSubpathLoaders = pluginSdkSubpaths.map((id: string) => ({
  id,
  load: () => importPluginSdkSubpath(`remoteclaw/plugin-sdk/${id}`),
}));

const asExports = (mod: object) => mod as Record<string, unknown>;
const ircSdk = await import("remoteclaw/plugin-sdk/irc");
const feishuSdk = await import("remoteclaw/plugin-sdk/feishu");
const googlechatSdk = await import("remoteclaw/plugin-sdk/googlechat");
const zaloSdk = await import("remoteclaw/plugin-sdk/zalo");
const synologyChatSdk = await import("remoteclaw/plugin-sdk/synology-chat");
const zalouserSdk = await import("remoteclaw/plugin-sdk/zalouser");
const tlonSdk = await import("remoteclaw/plugin-sdk/tlon");
const acpxSdk = await import("remoteclaw/plugin-sdk/acpx");
const bluebubblesSdk = await import("remoteclaw/plugin-sdk/bluebubbles");
const matrixSdk = await import("remoteclaw/plugin-sdk/matrix");
const mattermostSdk = await import("remoteclaw/plugin-sdk/mattermost");
const nextcloudTalkSdk = await import("remoteclaw/plugin-sdk/nextcloud-talk");
const twitchSdk = await import("remoteclaw/plugin-sdk/twitch");
const accountHelpersSdk = await import("remoteclaw/plugin-sdk/account-helpers");
const allowlistEditSdk = await import("remoteclaw/plugin-sdk/allowlist-config-edit");
const lobsterSdk = await import("remoteclaw/plugin-sdk/lobster");

describe("plugin-sdk subpath exports", () => {
  it("exports compat helpers", () => {
    expect(typeof compatSdk.emptyPluginConfigSchema).toBe("function");
    expect(typeof compatSdk.resolveControlCommandGate).toBe("function");
    expect(typeof compatSdk.createScopedChannelConfigAdapter).toBe("function");
    expect(typeof compatSdk.createTopLevelChannelConfigAdapter).toBe("function");
    expect(typeof compatSdk.createHybridChannelConfigAdapter).toBe("function");
  });

  it("keeps core focused on generic shared exports", () => {
    expect(typeof coreSdk.emptyPluginConfigSchema).toBe("function");
    expect(typeof coreSdk.definePluginEntry).toBe("function");
    expect(typeof coreSdk.defineChannelPluginEntry).toBe("function");
    expect(typeof coreSdk.defineSetupPluginEntry).toBe("function");
    expect(typeof coreSdk.createChannelPluginBase).toBe("function");
    expect(typeof coreSdk.isSecretRef).toBe("function");
    expect(typeof coreSdk.optionalStringEnum).toBe("function");
    expect("runPassiveAccountLifecycle" in asExports(coreSdk)).toBe(false);
    expect("createLoggerBackedRuntime" in asExports(coreSdk)).toBe(false);
    expect("registerSandboxBackend" in asExports(coreSdk)).toBe(false);
    expect("promptAndConfigureOpenAICompatibleSelfHostedProviderAuth" in asExports(coreSdk)).toBe(
      false,
    );
  });

  it("exports routing helpers from the dedicated subpath", () => {
    expect(typeof routingSdk.buildAgentSessionKey).toBe("function");
    expect(typeof routingSdk.resolveThreadSessionKeys).toBe("function");
  });

  it("exports reply payload helpers from the dedicated subpath", () => {
    expect(typeof replyPayloadSdk.deliverFormattedTextWithAttachments).toBe("function");
    expect(typeof replyPayloadSdk.deliverTextOrMediaReply).toBe("function");
    expect(typeof replyPayloadSdk.formatTextWithAttachmentLinks).toBe("function");
    expect(typeof replyPayloadSdk.resolveOutboundMediaUrls).toBe("function");
    expect(typeof replyPayloadSdk.resolveTextChunksWithFallback).toBe("function");
    expect(typeof replyPayloadSdk.sendMediaWithLeadingCaption).toBe("function");
    expect(typeof replyPayloadSdk.sendPayloadWithChunkedTextAndMedia).toBe("function");
  });

  it("exports account helper builders from the dedicated subpath", () => {
    expect(typeof accountHelpersSdk.createAccountListHelpers).toBe("function");
  });

  it("exports allowlist edit helpers from the dedicated subpath", () => {
    expect(typeof allowlistEditSdk.buildDmGroupAccountAllowlistAdapter).toBe("function");
    expect(typeof allowlistEditSdk.buildLegacyDmAccountAllowlistAdapter).toBe("function");
    expect(typeof allowlistEditSdk.createAccountScopedAllowlistNameResolver).toBe("function");
    expect(typeof allowlistEditSdk.createFlatAllowlistOverrideResolver).toBe("function");
    expect(typeof allowlistEditSdk.createNestedAllowlistOverrideResolver).toBe("function");
  });

  it("exports runtime helpers from the dedicated subpath", () => {
    expect(typeof runtimeSdk.createLoggerBackedRuntime).toBe("function");
  });

  it("exports directory runtime helpers from the dedicated subpath", () => {
    expect(typeof directoryRuntimeSdk.listDirectoryEntriesFromSources).toBe("function");
    expect(typeof directoryRuntimeSdk.listInspectedDirectoryEntriesFromSources).toBe("function");
    expect(typeof directoryRuntimeSdk.listResolvedDirectoryEntriesFromSources).toBe("function");
    expect(typeof directoryRuntimeSdk.listResolvedDirectoryGroupEntriesFromMapKeys).toBe(
      "function",
    );
    expect(typeof directoryRuntimeSdk.listResolvedDirectoryUserEntriesFromAllowFrom).toBe(
      "function",
    );
  });

  it("exports channel runtime helpers from the dedicated subpath", () => {
    expect(typeof channelRuntimeSdk.attachChannelToResult).toBe("function");
    expect(typeof channelRuntimeSdk.attachChannelToResults).toBe("function");
    expect(typeof channelRuntimeSdk.buildUnresolvedTargetResults).toBe("function");
    expect(typeof channelRuntimeSdk.createAttachedChannelResultAdapter).toBe("function");
    expect(typeof channelRuntimeSdk.createChannelDirectoryAdapter).toBe("function");
    expect(typeof channelRuntimeSdk.createEmptyChannelResult).toBe("function");
    expect(typeof channelRuntimeSdk.createEmptyChannelDirectoryAdapter).toBe("function");
    expect(typeof channelRuntimeSdk.createRawChannelSendResultAdapter).toBe("function");
    expect(typeof channelRuntimeSdk.createLoggedPairingApprovalNotifier).toBe("function");
    expect(typeof channelRuntimeSdk.createPairingPrefixStripper).toBe("function");
    expect(typeof channelRuntimeSdk.createScopedAccountReplyToModeResolver).toBe("function");
    expect(typeof channelRuntimeSdk.createStaticReplyToModeResolver).toBe("function");
    expect(typeof channelRuntimeSdk.createTopLevelChannelReplyToModeResolver).toBe("function");
    expect(typeof channelRuntimeSdk.createRuntimeDirectoryLiveAdapter).toBe("function");
    expect(typeof channelRuntimeSdk.createRuntimeOutboundDelegates).toBe("function");
    expect(typeof channelRuntimeSdk.sendPayloadMediaSequenceAndFinalize).toBe("function");
    expect(typeof channelRuntimeSdk.sendPayloadMediaSequenceOrFallback).toBe("function");
    expect(typeof channelRuntimeSdk.resolveTargetsWithOptionalToken).toBe("function");
    expect(typeof channelRuntimeSdk.createTextPairingAdapter).toBe("function");
  });

  it("exports channel send-result helpers from the dedicated subpath", () => {
    expect(typeof channelSendResultSdk.attachChannelToResult).toBe("function");
    expect(typeof channelSendResultSdk.attachChannelToResults).toBe("function");
    expect(typeof channelSendResultSdk.buildChannelSendResult).toBe("function");
    expect(typeof channelSendResultSdk.createAttachedChannelResultAdapter).toBe("function");
    expect(typeof channelSendResultSdk.createEmptyChannelResult).toBe("function");
    expect(typeof channelSendResultSdk.createRawChannelSendResultAdapter).toBe("function");
  });

  it("exports provider setup helpers from the dedicated subpath", () => {
    expect(typeof providerSetupSdk.buildVllmProvider).toBe("function");
    expect(typeof providerSetupSdk.discoverOpenAICompatibleSelfHostedProvider).toBe("function");
    expect(typeof providerSetupSdk.promptAndConfigureOpenAICompatibleSelfHostedProviderAuth).toBe(
      "function",
    );
  });

  it("exports shared setup helpers from the dedicated subpath", () => {
    expect(typeof setupSdk.DEFAULT_ACCOUNT_ID).toBe("string");
    expect(typeof setupSdk.createAccountScopedAllowFromSection).toBe("function");
    expect(typeof setupSdk.createAccountScopedGroupAccessSection).toBe("function");
    expect(typeof setupSdk.createAllowFromSection).toBe("function");
    expect(typeof setupSdk.createCliPathTextInput).toBe("function");
    expect(typeof setupSdk.createDelegatedFinalize).toBe("function");
    expect(typeof setupSdk.createDelegatedPrepare).toBe("function");
    expect(typeof setupSdk.createDelegatedResolveConfigured).toBe("function");
    expect(typeof setupSdk.createDelegatedSetupWizardProxy).toBe("function");
    expect(typeof setupSdk.createDelegatedSetupWizardStatusResolvers).toBe("function");
    expect(typeof setupSdk.createDelegatedTextInputShouldPrompt).toBe("function");
    expect(typeof setupSdk.createDetectedBinaryStatus).toBe("function");
    expect(typeof setupSdk.createLegacyCompatChannelDmPolicy).toBe("function");
    expect(typeof setupSdk.createNestedChannelDmPolicy).toBe("function");
    expect(typeof setupSdk.createTopLevelChannelDmPolicy).toBe("function");
    expect(typeof setupSdk.createTopLevelChannelDmPolicySetter).toBe("function");
    expect(typeof setupSdk.formatDocsLink).toBe("function");
    expect(typeof setupSdk.mergeAllowFromEntries).toBe("function");
    expect(typeof setupSdk.patchNestedChannelConfigSection).toBe("function");
    expect(typeof setupSdk.patchTopLevelChannelConfigSection).toBe("function");
    expect(typeof setupSdk.promptParsedAllowFromForAccount).toBe("function");
    expect(typeof setupSdk.resolveParsedAllowFromEntries).toBe("function");
    expect(typeof setupSdk.resolveGroupAllowlistWithLookupNotes).toBe("function");
    expect(typeof setupSdk.setAccountAllowFromForChannel).toBe("function");
    expect(typeof setupSdk.setAccountDmAllowFromForChannel).toBe("function");
    expect(typeof setupSdk.setTopLevelChannelDmPolicyWithAllowFrom).toBe("function");
    expect(typeof setupSdk.formatResolvedUnresolvedNote).toBe("function");
  });

  it("exports shared lazy runtime helpers from the dedicated subpath", () => {
    expect(typeof lazyRuntimeSdk.createLazyRuntimeSurface).toBe("function");
    expect(typeof lazyRuntimeSdk.createLazyRuntimeModule).toBe("function");
    expect(typeof lazyRuntimeSdk.createLazyRuntimeNamedExport).toBe("function");
  });

  it("exports narrow self-hosted provider setup helpers", () => {
    expect(typeof selfHostedProviderSetupSdk.buildVllmProvider).toBe("function");
    expect(typeof selfHostedProviderSetupSdk.buildSglangProvider).toBe("function");
    expect(typeof selfHostedProviderSetupSdk.discoverOpenAICompatibleSelfHostedProvider).toBe(
      "function",
    );
    expect(
      typeof selfHostedProviderSetupSdk.configureOpenAICompatibleSelfHostedProviderNonInteractive,
    ).toBe("function");
  });

  it("exports narrow Ollama setup helpers", () => {
    expect(typeof ollamaSetupSdk.buildOllamaProvider).toBe("function");
    expect(typeof ollamaSetupSdk.configureOllamaNonInteractive).toBe("function");
    expect(typeof ollamaSetupSdk.ensureOllamaModelPulled).toBe("function");
  });

  it("exports sandbox helpers from the dedicated subpath", () => {
    expect(typeof sandboxSdk.registerSandboxBackend).toBe("function");
    expect(typeof sandboxSdk.runPluginCommandWithTimeout).toBe("function");
    expect(typeof sandboxSdk.createRemoteShellSandboxFsBridge).toBe("function");
  });

  it("exports shared core types used by bundled channels", () => {
    expectTypeOf<CoreOpenClawPluginApi>().toMatchTypeOf<OpenClawPluginApi>();
    expectTypeOf<CorePluginRuntime>().toMatchTypeOf<PluginRuntime>();
    expectTypeOf<CoreChannelMessageActionContext>().toMatchTypeOf<ChannelMessageActionContext>();
  });

  it("exports the public testing surface", () => {
    expect(typeof testingSdk.removeAckReactionAfterReply).toBe("function");
    expect(typeof testingSdk.shouldAckReaction).toBe("function");
  });

  it("keeps core shared types aligned with the channel prelude", () => {
    expectTypeOf<CoreOpenClawPluginApi>().toMatchTypeOf<SharedOpenClawPluginApi>();
    expectTypeOf<CorePluginRuntime>().toMatchTypeOf<SharedPluginRuntime>();
    expectTypeOf<CoreChannelMessageActionContext>().toMatchTypeOf<SharedChannelMessageActionContext>();
  });

  it("exports Discord helpers", () => {
    expect(typeof discordSdk.resolveDiscordAccount).toBe("function");
    expect(typeof discordSdk.discordOnboardingAdapter).toBe("object");
  });

  it("exports Slack helpers", () => {
    expect(typeof slackSdk.resolveSlackAccount).toBe("function");
    expect(typeof slackSdk.handleSlackMessageAction).toBe("function");
  });

  it("exports Signal helpers", () => {
    expect(typeof signalSdk.resolveSignalAccount).toBe("function");
    expect(typeof signalSdk.signalOnboardingAdapter).toBe("object");
  });

  it("exports iMessage helpers", () => {
    expect(typeof imessageSdk.resolveIMessageAccount).toBe("function");
    expect(typeof imessageSdk.imessageOnboardingAdapter).toBe("object");
  });

  it("exports WhatsApp helpers", () => {
    expect(typeof whatsappSdk.resolveWhatsAppAccount).toBe("function");
    expect(typeof whatsappSdk.whatsappOnboardingAdapter).toBe("object");
  });

  it("exports LINE helpers", () => {
    expect(typeof lineSdk.processLineMessage).toBe("function");
    expect(typeof lineSdk.createInfoCard).toBe("function");
  });

  it("exports Microsoft Teams helpers", () => {
    expect(typeof msteamsSdk.resolveControlCommandGate).toBe("function");
    expect(typeof msteamsSdk.loadOutboundMediaFromUrl).toBe("function");
  });

  it("resolves bundled extension subpaths", async () => {
    for (const { id, load } of bundledExtensionSubpathLoaders) {
      const mod = await load();
      expect(typeof mod).toBe("object");
      expect(mod, `subpath ${id} should resolve`).toBeTruthy();
    }
  });

  it("keeps the newly added bundled plugin-sdk contracts available", async () => {
    const bluebubbles = await import("remoteclaw/plugin-sdk/bluebubbles");
    expect(typeof bluebubbles.parseFiniteNumber).toBe("function");

    const mattermost = await import("remoteclaw/plugin-sdk/mattermost");
    expect(typeof mattermost.parseStrictPositiveInteger).toBe("function");

    const nextcloudTalk = await import("remoteclaw/plugin-sdk/nextcloud-talk");
    expect(typeof nextcloudTalk.waitForAbortSignal).toBe("function");

    const twitch = await import("remoteclaw/plugin-sdk/twitch");
    expect(typeof twitch.DEFAULT_ACCOUNT_ID).toBe("string");
    expect(typeof twitch.normalizeAccountId).toBe("function");
  });
});
