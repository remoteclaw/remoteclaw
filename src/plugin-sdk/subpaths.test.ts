import * as compatSdk from "remoteclaw/plugin-sdk/compat";
import * as coreSdk from "remoteclaw/plugin-sdk/core";
import * as discordSdk from "remoteclaw/plugin-sdk/discord";
import * as imessageSdk from "remoteclaw/plugin-sdk/imessage";
import * as lineSdk from "remoteclaw/plugin-sdk/line";
import * as msteamsSdk from "remoteclaw/plugin-sdk/msteams";
import * as signalSdk from "remoteclaw/plugin-sdk/signal";
import * as slackSdk from "remoteclaw/plugin-sdk/slack";
import * as whatsappSdk from "remoteclaw/plugin-sdk/whatsapp";
import { describe, expect, it } from "vitest";

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

const importResolvedPluginSdkSubpath = async (specifier: string) =>
  import(pathToFileURL(requireFromHere.resolve(specifier)).href);

function readPluginSdkSource(subpath: string): string {
  const file = resolve(PLUGIN_SDK_DIR, `${subpath}.ts`);
  const cached = sourceCache.get(file);
  if (cached !== undefined) {
    return cached;
  }
  const text = readFileSync(file, "utf8");
  sourceCache.set(file, text);
  return text;
}

function isIdentifierCode(code: number): boolean {
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    code === 36 ||
    code === 95
  );
}

function sourceMentionsIdentifier(source: string, name: string): boolean {
  let fromIndex = 0;
  while (true) {
    const matchIndex = source.indexOf(name, fromIndex);
    if (matchIndex === -1) {
      return false;
    }
    const beforeCode = matchIndex === 0 ? -1 : source.charCodeAt(matchIndex - 1);
    const afterIndex = matchIndex + name.length;
    const afterCode = afterIndex >= source.length ? -1 : source.charCodeAt(afterIndex);
    if (!isIdentifierCode(beforeCode) && !isIdentifierCode(afterCode)) {
      return true;
    }
    fromIndex = matchIndex + 1;
  }
}

function expectSourceMentions(subpath: string, names: readonly string[]) {
  const source = readPluginSdkSource(subpath);
  const missing = names.filter((name) => !sourceMentionsIdentifier(source, name));
  expect(missing, `${subpath} missing exports`).toEqual([]);
}

function expectSourceOmits(subpath: string, names: readonly string[]) {
  const source = readPluginSdkSource(subpath);
  const present = names.filter((name) => sourceMentionsIdentifier(source, name));
  expect(present, `${subpath} leaked exports`).toEqual([]);
}

function expectSourceContract(
  subpath: string,
  params: { mentions?: readonly string[]; omits?: readonly string[] },
) {
  const source = readPluginSdkSource(subpath);
  const missing = (params.mentions ?? []).filter((name) => !sourceMentionsIdentifier(source, name));
  const present = (params.omits ?? []).filter((name) => sourceMentionsIdentifier(source, name));
  expect(missing, `${subpath} missing exports`).toEqual([]);
  expect(present, `${subpath} leaked exports`).toEqual([]);
}

function expectSourceContains(subpath: string, snippet: string) {
  expect(readPluginSdkSource(subpath)).toContain(snippet);
}

describe("plugin-sdk subpath exports", () => {
  it("exports compat helpers", () => {
    expect(typeof compatSdk.emptyPluginConfigSchema).toBe("function");
    expect(typeof compatSdk.resolveControlCommandGate).toBe("function");
  });

  it("keeps helper subpaths aligned", () => {
    expectSourceMentions("core", [
      "emptyPluginConfigSchema",
      "definePluginEntry",
      "defineChannelPluginEntry",
      "defineSetupPluginEntry",
      "createChatChannelPlugin",
      "createChannelPluginBase",
      "isSecretRef",
      "optionalStringEnum",
    ]);
    expectSourceOmits("core", [
      "runPassiveAccountLifecycle",
      "createLoggerBackedRuntime",
      "registerSandboxBackend",
    ]);
    expectSourceContract("routing", {
      mentions: [
        "buildAgentSessionKey",
        "resolveThreadSessionKeys",
        "normalizeMessageChannel",
        "resolveGatewayMessageChannel",
      ],
    });
    expectSourceMentions("reply-payload", [
      "buildMediaPayload",
      "deliverTextOrMediaReply",
      "resolveOutboundMediaUrls",
      "resolvePayloadMediaUrls",
      "sendPayloadMediaSequenceAndFinalize",
      "sendPayloadMediaSequenceOrFallback",
      "sendTextMediaPayload",
      "sendPayloadWithChunkedTextAndMedia",
    ]);
    expectSourceMentions("media-runtime", [
      "createDirectTextMediaOutbound",
      "createScopedChannelMediaMaxBytesResolver",
    ]);
    expectSourceMentions("reply-history", [
      "buildPendingHistoryContextFromMap",
      "clearHistoryEntriesIfEnabled",
      "recordPendingHistoryEntryIfEnabled",
    ]);
    expectSourceContract("reply-runtime", {
      omits: [
        "buildPendingHistoryContextFromMap",
        "clearHistoryEntriesIfEnabled",
        "recordPendingHistoryEntryIfEnabled",
        "DEFAULT_GROUP_HISTORY_LIMIT",
      ],
    });
    expectSourceMentions("account-helpers", ["createAccountListHelpers"]);
    expectSourceMentions("device-bootstrap", [
      "approveDevicePairing",
      "issueDeviceBootstrapToken",
      "listDevicePairing",
    ]);
    expectSourceMentions("allowlist-config-edit", [
      "buildDmGroupAccountAllowlistAdapter",
      "createNestedAllowlistOverrideResolver",
    ]);
    expectSourceContract("allow-from", {
      mentions: [
        "addAllowlistUserEntriesFromConfigEntry",
        "buildAllowlistResolutionSummary",
        "canonicalizeAllowlistWithResolvedIds",
        "mapAllowlistResolutionInputs",
        "mergeAllowlist",
        "patchAllowlistUsersInConfigEntries",
        "summarizeMapping",
        "compileAllowlist",
        "firstDefined",
        "formatAllowlistMatchMeta",
        "isSenderIdAllowed",
        "mergeDmAllowFromSources",
        "resolveAllowlistMatchSimple",
      ],
    });
    expectSourceMentions("runtime", ["createLoggerBackedRuntime"]);
    expectSourceMentions("discord", [
      "buildDiscordComponentMessage",
      "editDiscordComponentMessage",
      "registerBuiltDiscordComponentMessage",
      "resolveDiscordAccount",
    ]);
    expectSourceMentions("conversation-runtime", [
      "recordInboundSession",
      "recordInboundSessionMetaSafe",
      "resolveConversationLabel",
    ]);
    expectSourceMentions("directory-runtime", [
      "createChannelDirectoryAdapter",
      "createRuntimeDirectoryLiveAdapter",
      "listDirectoryEntriesFromSources",
      "listResolvedDirectoryEntriesFromSources",
    ]);
  });

  it("exports channel runtime helpers from the dedicated subpath", () => {
    expectSourceOmits("channel-runtime", [
      "applyChannelMatchMeta",
      "createChannelDirectoryAdapter",
      "createEmptyChannelDirectoryAdapter",
      "createArmableStallWatchdog",
      "createDraftStreamLoop",
      "createLoggedPairingApprovalNotifier",
      "createPairingPrefixStripper",
      "createRunStateMachine",
      "createRuntimeDirectoryLiveAdapter",
      "createRuntimeOutboundDelegates",
      "createStatusReactionController",
      "createTextPairingAdapter",
      "createFinalizableDraftLifecycle",
      "DEFAULT_EMOJIS",
      "logAckFailure",
      "logTypingFailure",
      "logInboundDrop",
      "normalizeMessageChannel",
      "removeAckReactionAfterReply",
      "recordInboundSession",
      "recordInboundSessionMetaSafe",
      "resolveInboundSessionEnvelopeContext",
      "resolveMentionGating",
      "resolveMentionGatingWithBypass",
      "resolveOutboundSendDep",
      "resolveConversationLabel",
      "shouldDebounceTextInbound",
      "shouldAckReaction",
      "shouldAckReactionForWhatsApp",
      "toLocationContext",
      "resolveThreadBindingConversationIdFromBindingId",
      "resolveThreadBindingEffectiveExpiresAt",
      "resolveThreadBindingFarewellText",
      "resolveThreadBindingIdleTimeoutMs",
      "resolveThreadBindingIdleTimeoutMsForChannel",
      "resolveThreadBindingIntroText",
      "resolveThreadBindingLifecycle",
      "resolveThreadBindingMaxAgeMs",
      "resolveThreadBindingMaxAgeMsForChannel",
      "resolveThreadBindingSpawnPolicy",
      "resolveThreadBindingThreadName",
      "resolveThreadBindingsEnabled",
      "formatThreadBindingDisabledError",
      "DISCORD_THREAD_BINDING_CHANNEL",
      "MATRIX_THREAD_BINDING_CHANNEL",
      "resolveControlCommandGate",
      "resolveCommandAuthorizedFromAuthorizers",
      "resolveDualTextControlCommandGate",
      "resolveNativeCommandSessionTargets",
      "attachChannelToResult",
      "buildComputedAccountStatusSnapshot",
      "buildMediaPayload",
      "createActionGate",
      "jsonResult",
      "normalizeInteractiveReply",
      "PAIRING_APPROVED_MESSAGE",
      "projectCredentialSnapshotFields",
      "readStringParam",
      "compileAllowlist",
      "formatAllowlistMatchMeta",
      "firstDefined",
      "isSenderIdAllowed",
      "mergeDmAllowFromSources",
      "addAllowlistUserEntriesFromConfigEntry",
      "buildAllowlistResolutionSummary",
      "canonicalizeAllowlistWithResolvedIds",
      "mergeAllowlist",
      "patchAllowlistUsersInConfigEntries",
      "resolveChannelConfigWrites",
      "resolvePayloadMediaUrls",
      "resolveScopedChannelMediaMaxBytes",
      "sendPayloadMediaSequenceAndFinalize",
      "sendPayloadMediaSequenceOrFallback",
      "sendTextMediaPayload",
      "createScopedChannelMediaMaxBytesResolver",
      "runPassiveAccountLifecycle",
      "buildChannelKeyCandidates",
      "buildMessagingTarget",
      "createDirectTextMediaOutbound",
      "createMessageToolButtonsSchema",
      "createMessageToolCardSchema",
      "createScopedAccountReplyToModeResolver",
      "createStaticReplyToModeResolver",
      "createTopLevelChannelReplyToModeResolver",
      "createUnionActionGate",
      "ensureTargetId",
      "listTokenSourcedAccounts",
      "parseMentionPrefixOrAtUserTarget",
      "requireTargetKind",
      "resolveChannelEntryMatchWithFallback",
      "resolveChannelMatchConfig",
      "resolveReactionMessageId",
      "resolveTargetsWithOptionalToken",
      "appendMatchMetadata",
      "asString",
      "collectIssuesForEnabledAccounts",
      "isRecord",
      "resolveEnabledConfiguredAccountId",
    ]);
    expectSourceMentions("channel-inbound", [
      "buildMentionRegexes",
      "createChannelInboundDebouncer",
      "createInboundDebouncer",
      "formatInboundEnvelope",
      "formatInboundFromLabel",
      "formatLocationText",
      "logInboundDrop",
      "matchesMentionPatterns",
      "matchesMentionWithExplicit",
      "normalizeMentionText",
      "resolveInboundDebounceMs",
      "resolveEnvelopeFormatOptions",
      "resolveInboundSessionEnvelopeContext",
      "resolveMentionGating",
      "resolveMentionGatingWithBypass",
      "shouldDebounceTextInbound",
      "toLocationContext",
    ]);
    expectSourceContract("reply-runtime", {
      omits: [
        "buildMentionRegexes",
        "createInboundDebouncer",
        "formatInboundEnvelope",
        "formatInboundFromLabel",
        "matchesMentionPatterns",
        "matchesMentionWithExplicit",
        "normalizeMentionText",
        "resolveEnvelopeFormatOptions",
        "resolveInboundDebounceMs",
        "hasControlCommand",
        "buildCommandTextFromArgs",
        "buildCommandsPaginationKeyboard",
        "buildModelsProviderData",
        "listNativeCommandSpecsForConfig",
        "listSkillCommandsForAgents",
        "normalizeCommandBody",
        "resolveCommandAuthorization",
        "resolveStoredModelOverride",
        "shouldComputeCommandAuthorized",
        "shouldHandleTextCommands",
      ],
    });
    expectSourceMentions("channel-setup", [
      "createOptionalChannelSetupSurface",
      "createTopLevelChannelDmPolicy",
    ]);
    expectSourceContract("channel-actions", {
      mentions: [
        "createUnionActionGate",
        "listTokenSourcedAccounts",
        "resolveReactionMessageId",
        "createMessageToolButtonsSchema",
        "createMessageToolCardSchema",
      ],
    });
    expectSourceMentions("channel-targets", [
      "applyChannelMatchMeta",
      "buildChannelKeyCandidates",
      "buildMessagingTarget",
      "ensureTargetId",
      "parseMentionPrefixOrAtUserTarget",
      "requireTargetKind",
      "resolveChannelEntryMatchWithFallback",
      "resolveChannelMatchConfig",
      "resolveTargetsWithOptionalToken",
    ]);
    expectSourceMentions("channel-config-helpers", [
      "authorizeConfigWrite",
      "canBypassConfigWritePolicy",
      "formatConfigWriteDeniedMessage",
      "resolveChannelConfigWrites",
    ]);
    expectSourceMentions("channel-feedback", [
      "createStatusReactionController",
      "logAckFailure",
      "logTypingFailure",
      "removeAckReactionAfterReply",
      "shouldAckReaction",
      "shouldAckReactionForWhatsApp",
      "DEFAULT_EMOJIS",
    ]);
    expectSourceMentions("status-helpers", [
      "appendMatchMetadata",
      "asString",
      "collectIssuesForEnabledAccounts",
      "isRecord",
      "resolveEnabledConfiguredAccountId",
    ]);
    expectSourceMentions("outbound-runtime", [
      "createRuntimeOutboundDelegates",
      "resolveOutboundSendDep",
      "resolveAgentOutboundIdentity",
    ]);
    expectSourceMentions("command-auth", [
      "buildCommandTextFromArgs",
      "buildCommandsPaginationKeyboard",
      "buildModelsProviderData",
      "hasControlCommand",
      "listNativeCommandSpecsForConfig",
      "listSkillCommandsForAgents",
      "normalizeCommandBody",
      "resolveCommandAuthorization",
      "resolveCommandAuthorizedFromAuthorizers",
      "resolveControlCommandGate",
      "resolveDualTextControlCommandGate",
      "resolveNativeCommandSessionTargets",
      "resolveStoredModelOverride",
      "shouldComputeCommandAuthorized",
      "shouldHandleTextCommands",
    ]);
    expectSourceMentions("channel-send-result", [
      "attachChannelToResult",
      "buildChannelSendResult",
    ]);

    expectSourceMentions("conversation-runtime", [
      "DISCORD_THREAD_BINDING_CHANNEL",
      "MATRIX_THREAD_BINDING_CHANNEL",
      "formatThreadBindingDisabledError",
      "resolveThreadBindingFarewellText",
      "resolveThreadBindingConversationIdFromBindingId",
      "resolveThreadBindingEffectiveExpiresAt",
      "resolveThreadBindingIdleTimeoutMs",
      "resolveThreadBindingIdleTimeoutMsForChannel",
      "resolveThreadBindingIntroText",
      "resolveThreadBindingLifecycle",
      "resolveThreadBindingMaxAgeMs",
      "resolveThreadBindingMaxAgeMsForChannel",
      "resolveThreadBindingSpawnPolicy",
      "resolveThreadBindingThreadName",
      "resolveThreadBindingsEnabled",
      "formatThreadBindingDurationLabel",
      "createScopedAccountReplyToModeResolver",
      "createStaticReplyToModeResolver",
      "createTopLevelChannelReplyToModeResolver",
    ]);

    expectSourceMentions("thread-bindings-runtime", ["resolveThreadBindingLifecycle"]);
    expectSourceMentions("matrix-runtime-shared", ["formatZonedTimestamp"]);
    expectSourceMentions("ssrf-runtime", [
      "closeDispatcher",
      "createPinnedDispatcher",
      "resolvePinnedHostnameWithPolicy",
      "assertHttpUrlTargetsPrivateNetwork",
      "ssrfPolicyFromAllowPrivateNetwork",
    ]);

    expectSourceMentions("provider-setup", [
      "buildVllmProvider",
      "discoverOpenAICompatibleSelfHostedProvider",
    ]);
    expectSourceMentions("provider-auth", [
      "buildOauthProviderAuthResult",
      "generatePkceVerifierChallenge",
      "toFormUrlEncoded",
    ]);
    expectSourceOmits("core", ["buildOauthProviderAuthResult"]);
    expectSourceContract("provider-models", {
      mentions: ["applyOpenAIConfig", "buildKilocodeModelDefinition", "discoverHuggingfaceModels"],
      omits: [
        "buildMinimaxModelDefinition",
        "buildMoonshotProvider",
        "QIANFAN_BASE_URL",
        "resolveZaiBaseUrl",
      ],
    });

    expectSourceMentions("setup", [
      "DEFAULT_ACCOUNT_ID",
      "createAllowFromSection",
      "createDelegatedSetupWizardProxy",
      "createTopLevelChannelDmPolicy",
      "mergeAllowFromEntries",
    ]);
    expectSourceMentions("lazy-runtime", ["createLazyRuntimeSurface", "createLazyRuntimeModule"]);
    expectSourceMentions("self-hosted-provider-setup", [
      "buildVllmProvider",
      "buildSglangProvider",
      "configureOpenAICompatibleSelfHostedProviderNonInteractive",
    ]);
    expectSourceMentions("ollama-setup", ["buildOllamaProvider", "configureOllamaNonInteractive"]);
    expectSourceMentions("sandbox", ["registerSandboxBackend", "runPluginCommandWithTimeout"]);

    expectSourceMentions("secret-input", [
      "buildSecretInputSchema",
      "buildOptionalSecretInputSchema",
      "normalizeSecretInputString",
    ]);
    expectSourceOmits("config-runtime", [
      "hasConfiguredSecretInput",
      "normalizeResolvedSecretInputString",
      "normalizeSecretInputString",
    ]);
    expectSourceMentions("webhook-ingress", [
      "registerPluginHttpRoute",
      "resolveWebhookPath",
      "readRequestBodyWithLimit",
      "readJsonWebhookBodyOrReject",
      "requestBodyErrorToText",
      "withResolvedWebhookRequestPipeline",
    ]);
    expectSourceMentions("testing", ["removeAckReactionAfterReply", "shouldAckReaction"]);
  });

  it("keeps shared plugin-sdk types aligned", () => {
    expectTypeOf<ContractBaseProbeResult>().toMatchTypeOf<BaseProbeResult>();
    expectTypeOf<ContractBaseTokenResolution>().toMatchTypeOf<BaseTokenResolution>();
    expectTypeOf<ContractChannelAgentTool>().toMatchTypeOf<ChannelAgentTool>();
    expectTypeOf<ContractChannelAccountSnapshot>().toMatchTypeOf<ChannelAccountSnapshot>();
    expectTypeOf<ContractChannelGroupContext>().toMatchTypeOf<ChannelGroupContext>();
    expectTypeOf<ContractChannelMessageActionAdapter>().toMatchTypeOf<ChannelMessageActionAdapter>();
    expectTypeOf<ContractChannelMessageActionContext>().toMatchTypeOf<ChannelMessageActionContext>();
    expectTypeOf<ContractChannelMessageActionName>().toMatchTypeOf<ChannelMessageActionName>();
    expectTypeOf<ContractChannelMessageToolDiscovery>().toMatchTypeOf<ChannelMessageToolDiscovery>();
    expectTypeOf<ContractChannelStatusIssue>().toMatchTypeOf<ChannelStatusIssue>();
    expectTypeOf<ContractChannelThreadingContext>().toMatchTypeOf<ChannelThreadingContext>();
    expectTypeOf<ContractChannelThreadingToolContext>().toMatchTypeOf<ChannelThreadingToolContext>();
    expectTypeOf<CoreOpenClawPluginApi>().toMatchTypeOf<OpenClawPluginApi>();
    expectTypeOf<CorePluginRuntime>().toMatchTypeOf<PluginRuntime>();
    expectTypeOf<CoreChannelMessageActionContext>().toMatchTypeOf<ChannelMessageActionContext>();
    expectTypeOf<CoreOpenClawPluginApi>().toMatchTypeOf<SharedOpenClawPluginApi>();
    expectTypeOf<CorePluginRuntime>().toMatchTypeOf<SharedPluginRuntime>();
    expectTypeOf<CoreChannelMessageActionContext>().toMatchTypeOf<SharedChannelMessageActionContext>();
  });

  it("keeps runtime entry subpaths importable", async () => {
    const [
      coreSdk,
      pluginEntrySdk,
      channelLifecycleSdk,
      channelPairingSdk,
      channelReplyPipelineSdk,
      ...representativeModules
    ] = await Promise.all([
      importResolvedPluginSdkSubpath("openclaw/plugin-sdk/core"),
      importResolvedPluginSdkSubpath("openclaw/plugin-sdk/plugin-entry"),
      importResolvedPluginSdkSubpath("openclaw/plugin-sdk/channel-lifecycle"),
      importResolvedPluginSdkSubpath("openclaw/plugin-sdk/channel-pairing"),
      importResolvedPluginSdkSubpath("openclaw/plugin-sdk/channel-reply-pipeline"),
      ...representativeRuntimeSmokeSubpaths.map((id) =>
        importResolvedPluginSdkSubpath(`openclaw/plugin-sdk/${id}`),
      ),
    ]);

    expect(coreSdk.definePluginEntry).toBe(pluginEntrySdk.definePluginEntry);

    expectSourceMentions("infra-runtime", ["createRuntimeOutboundDelegates"]);
    expectSourceContains("infra-runtime", "../infra/outbound/send-deps.js");

    expect(typeof channelLifecycleSdk.createDraftStreamLoop).toBe("function");
    expect(typeof channelLifecycleSdk.createFinalizableDraftLifecycle).toBe("function");
    expect(typeof channelLifecycleSdk.runPassiveAccountLifecycle).toBe("function");
    expect(typeof channelLifecycleSdk.createRunStateMachine).toBe("function");
    expect(typeof channelLifecycleSdk.createArmableStallWatchdog).toBe("function");

    expectSourceMentions("channel-pairing", [
      "createChannelPairingController",
      "createChannelPairingChallengeIssuer",
      "createLoggedPairingApprovalNotifier",
      "createPairingPrefixStripper",
      "createTextPairingAdapter",
    ]);
    expect("createScopedPairingAccess" in channelPairingSdk).toBe(false);

    expectSourceMentions("channel-reply-pipeline", ["createChannelReplyPipeline"]);
    expect("createTypingCallbacks" in channelReplyPipelineSdk).toBe(false);
    expect("createReplyPrefixContext" in channelReplyPipelineSdk).toBe(false);
    expect("createReplyPrefixOptions" in channelReplyPipelineSdk).toBe(false);

    expect(pluginSdkSubpaths.length).toBeGreaterThan(representativeRuntimeSmokeSubpaths.length);
    for (const [index, id] of representativeRuntimeSmokeSubpaths.entries()) {
      const mod = representativeModules[index];
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
