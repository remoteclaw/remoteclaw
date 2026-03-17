import * as compatSdk from "remoteclaw/plugin-sdk/compat";
import * as coreSdk from "remoteclaw/plugin-sdk/core";
import type {
  ChannelMessageActionContext as CoreChannelMessageActionContext,
  RemoteClawPluginApi as CoreRemoteClawPluginApi,
  PluginRuntime as CorePluginRuntime,
} from "remoteclaw/plugin-sdk/core";
import * as discordSdk from "remoteclaw/plugin-sdk/discord";
import * as imessageSdk from "remoteclaw/plugin-sdk/imessage";
import * as lineSdk from "remoteclaw/plugin-sdk/line";
import * as msteamsSdk from "remoteclaw/plugin-sdk/msteams";
import * as nostrSdk from "remoteclaw/plugin-sdk/nostr";
import * as ollamaSetupSdk from "remoteclaw/plugin-sdk/ollama-setup";
import * as providerSetupSdk from "remoteclaw/plugin-sdk/provider-setup";
import * as routingSdk from "remoteclaw/plugin-sdk/routing";
import * as runtimeSdk from "remoteclaw/plugin-sdk/runtime";
import * as sandboxSdk from "remoteclaw/plugin-sdk/sandbox";
import * as selfHostedProviderSetupSdk from "remoteclaw/plugin-sdk/self-hosted-provider-setup";
import * as setupSdk from "remoteclaw/plugin-sdk/setup";
import * as signalSdk from "remoteclaw/plugin-sdk/signal";
import * as slackSdk from "remoteclaw/plugin-sdk/slack";
import * as telegramSdk from "remoteclaw/plugin-sdk/telegram";
import * as testingSdk from "remoteclaw/plugin-sdk/testing";
import * as whatsappSdk from "remoteclaw/plugin-sdk/whatsapp";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { ChannelMessageActionContext } from "../channels/plugins/types.js";
import type { PluginRuntime } from "../plugins/runtime/types.js";
import type { RemoteClawPluginApi } from "../plugins/types.js";
import type {
  ChannelMessageActionContext as SharedChannelMessageActionContext,
  RemoteClawPluginApi as SharedRemoteClawPluginApi,
  PluginRuntime as SharedPluginRuntime,
} from "./channel-plugin-common.js";
import { pluginSdkSubpaths } from "./entrypoints.js";

const bundledExtensionSubpathLoaders = [
  { id: "acpx", load: () => import("remoteclaw/plugin-sdk/acpx") },
  { id: "bluebubbles", load: () => import("remoteclaw/plugin-sdk/bluebubbles") },
  { id: "copilot-proxy", load: () => import("remoteclaw/plugin-sdk/copilot-proxy") },
  { id: "device-pair", load: () => import("remoteclaw/plugin-sdk/device-pair") },
  { id: "diagnostics-otel", load: () => import("remoteclaw/plugin-sdk/diagnostics-otel") },
  { id: "diffs", load: () => import("remoteclaw/plugin-sdk/diffs") },
  { id: "feishu", load: () => import("remoteclaw/plugin-sdk/feishu") },
  {
    id: "google-gemini-cli-auth",
    load: () => import("remoteclaw/plugin-sdk/google-gemini-cli-auth"),
  },
  { id: "googlechat", load: () => import("remoteclaw/plugin-sdk/googlechat") },
  { id: "irc", load: () => import("remoteclaw/plugin-sdk/irc") },
  { id: "llm-task", load: () => import("remoteclaw/plugin-sdk/llm-task") },
  { id: "lobster", load: () => import("remoteclaw/plugin-sdk/lobster") },
  { id: "matrix", load: () => import("remoteclaw/plugin-sdk/matrix") },
  { id: "mattermost", load: () => import("remoteclaw/plugin-sdk/mattermost") },
  {
    id: "minimax-portal-auth",
    load: () => import("remoteclaw/plugin-sdk/minimax-portal-auth"),
  },
  { id: "nextcloud-talk", load: () => import("remoteclaw/plugin-sdk/nextcloud-talk") },
  { id: "nostr", load: () => import("remoteclaw/plugin-sdk/nostr") },
  { id: "open-prose", load: () => import("remoteclaw/plugin-sdk/open-prose") },
  { id: "phone-control", load: () => import("remoteclaw/plugin-sdk/phone-control") },
  { id: "qwen-portal-auth", load: () => import("remoteclaw/plugin-sdk/qwen-portal-auth") },
  { id: "synology-chat", load: () => import("remoteclaw/plugin-sdk/synology-chat") },
  { id: "talk-voice", load: () => import("remoteclaw/plugin-sdk/talk-voice") },
  { id: "test-utils", load: () => import("remoteclaw/plugin-sdk/test-utils") },
  { id: "thread-ownership", load: () => import("remoteclaw/plugin-sdk/thread-ownership") },
  { id: "tlon", load: () => import("remoteclaw/plugin-sdk/tlon") },
  { id: "twitch", load: () => import("remoteclaw/plugin-sdk/twitch") },
  { id: "voice-call", load: () => import("remoteclaw/plugin-sdk/voice-call") },
  { id: "zalo", load: () => import("remoteclaw/plugin-sdk/zalo") },
  { id: "zalouser", load: () => import("remoteclaw/plugin-sdk/zalouser") },
] as const;

describe("plugin-sdk subpath exports", () => {
  it("exports compat helpers", () => {
    expect(typeof compatSdk.emptyPluginConfigSchema).toBe("function");
    expect(typeof compatSdk.resolveControlCommandGate).toBe("function");
  });

  it("keeps core focused on generic shared exports", () => {
    expect(typeof coreSdk.emptyPluginConfigSchema).toBe("function");
    expect(typeof coreSdk.definePluginEntry).toBe("function");
    expect(typeof coreSdk.defineChannelPluginEntry).toBe("function");
    expect(typeof coreSdk.defineSetupPluginEntry).toBe("function");
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

  it("exports runtime helpers from the dedicated subpath", () => {
    expect(typeof runtimeSdk.createLoggerBackedRuntime).toBe("function");
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
    expect(typeof setupSdk.formatDocsLink).toBe("function");
    expect(typeof setupSdk.mergeAllowFromEntries).toBe("function");
    expect(typeof setupSdk.setTopLevelChannelDmPolicyWithAllowFrom).toBe("function");
    expect(typeof setupSdk.formatResolvedUnresolvedNote).toBe("function");
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
    expectTypeOf<CoreRemoteClawPluginApi>().toMatchTypeOf<RemoteClawPluginApi>();
    expectTypeOf<CorePluginRuntime>().toMatchTypeOf<PluginRuntime>();
    expectTypeOf<CoreChannelMessageActionContext>().toMatchTypeOf<ChannelMessageActionContext>();
  });

  it("exports the public testing seam", () => {
    expect(typeof testingSdk.removeAckReactionAfterReply).toBe("function");
    expect(typeof testingSdk.shouldAckReaction).toBe("function");
  });

  it("keeps core shared types aligned with the channel prelude", () => {
    expectTypeOf<CoreRemoteClawPluginApi>().toMatchTypeOf<SharedRemoteClawPluginApi>();
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
    // WhatsApp-specific functions (resolveWhatsAppAccount, whatsappOnboardingAdapter) moved to extensions/whatsapp/src/
    expect(typeof whatsappSdk.WhatsAppConfigSchema).toBe("object");
    expect(typeof whatsappSdk.resolveWhatsAppOutboundTarget).toBe("function");
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
