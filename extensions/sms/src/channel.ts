import {
  applyAccountNameToChannelSection,
  applySetupAccountConfigPatch,
  buildAccountScopedDmSecurityPolicy,
  buildBaseAccountStatusSnapshot,
  buildBaseChannelStatusSummary,
  collectAllowlistProviderRestrictSendersWarnings,
  collectStatusIssuesFromLastError,
  createDefaultChannelRuntimeState,
  createScopedAccountConfigAccessors,
  DEFAULT_ACCOUNT_ID,
  deleteAccountFromConfigSection,
  migrateBaseNameToDefaultAccount,
  normalizeAccountId,
  setAccountEnabledInConfigSection,
  type ChannelMeta,
  type ChannelPlugin,
} from "remoteclaw/plugin-sdk/compat";
import { chunkTextForOutbound } from "../../../src/plugin-sdk/text-chunking.js";
import {
  isSmsAccountConfigured,
  listSmsAccountIds,
  resolveDefaultSmsAccountId,
  resolveSmsAccount,
} from "./accounts.js";
import { SmsChannelConfigSchema } from "./config-schema.js";
import {
  looksLikeSmsPhoneNumber,
  normalizeSmsAllowFrom,
  normalizeSmsPhoneNumber,
} from "./phone.js";
import { sendSmsTextChunks } from "./send.js";
import { probeSmsAccount } from "./status.js";
import type { ResolvedSmsAccount } from "./types.js";

// SMS is a plugin channel, not one of the nine static leaf channels in
// CHAT_CHANNEL_ORDER, so the shared leaf-meta lookup does not accept "sms" as a
// ChatChannelId. Meta is declared inline (as mattermost/matrix do) and mirrors
// the `remoteclaw.channel` block in this package's package.json verbatim.
const meta: ChannelMeta = {
  id: "sms",
  label: "SMS",
  selectionLabel: "SMS (Twilio)",
  detailLabel: "Twilio SMS",
  docsPath: "/channels/sms",
  docsLabel: "sms",
  blurb: "Twilio-backed SMS with inbound webhooks and outbound replies.",
  order: 88,
  quickstartAllowFrom: true,
};

const smsConfigAccessors = createScopedAccountConfigAccessors({
  // PR-2's resolveSmsAccount takes positional args; the accessor factory passes
  // an object, so adapt rather than assume the peers' object-form signature.
  resolveAccount: ({ cfg, accountId }) => resolveSmsAccount(cfg, accountId),
  resolveAllowFrom: (account: ResolvedSmsAccount) => account.allowFrom,
  formatAllowFrom: (allowFrom) =>
    allowFrom.map((entry) => normalizeSmsAllowFrom(String(entry))).filter(Boolean),
  resolveDefaultTo: (account: ResolvedSmsAccount) => account.defaultTo,
});

export const smsPlugin: ChannelPlugin<ResolvedSmsAccount> = {
  id: "sms",
  meta: {
    ...meta,
  },
  capabilities: {
    chatTypes: ["direct"],
    media: false,
  },
  reload: { configPrefixes: ["channels.sms"] },
  configSchema: SmsChannelConfigSchema,
  config: {
    listAccountIds: (cfg) => listSmsAccountIds(cfg),
    resolveAccount: (cfg, accountId) => resolveSmsAccount(cfg, accountId),
    defaultAccountId: (cfg) => resolveDefaultSmsAccountId(cfg),
    setAccountEnabled: ({ cfg, accountId, enabled }) =>
      setAccountEnabledInConfigSection({
        cfg,
        sectionKey: "sms",
        accountId,
        enabled,
        allowTopLevel: true,
      }),
    deleteAccount: ({ cfg, accountId }) =>
      deleteAccountFromConfigSection({
        cfg,
        sectionKey: "sms",
        accountId,
        clearBaseFields: [
          "accountSid",
          "authToken",
          "fromNumber",
          "messagingServiceSid",
          "defaultTo",
          "webhookPath",
          "publicWebhookUrl",
          "name",
        ],
      }),
    isConfigured: (account) => isSmsAccountConfigured(account),
    describeAccount: (account) => ({
      accountId: account.accountId,
      enabled: account.enabled,
      configured: isSmsAccountConfigured(account),
    }),
    ...smsConfigAccessors,
  },
  security: {
    resolveDmPolicy: ({ cfg, accountId, account }) => {
      return buildAccountScopedDmSecurityPolicy({
        cfg,
        channelKey: "sms",
        accountId,
        fallbackAccountId: account.accountId ?? DEFAULT_ACCOUNT_ID,
        // ResolvedSmsAccount is flat — dmPolicy/allowFrom sit on the account
        // itself, not under an `account.config` sub-object like signal's.
        policy: account.dmPolicy,
        allowFrom: account.allowFrom ?? [],
        policyPathSuffix: "dmPolicy",
        normalizeEntry: (raw) => normalizeSmsAllowFrom(raw),
      });
    },
    collectWarnings: ({ cfg }) => {
      return collectAllowlistProviderRestrictSendersWarnings({
        cfg,
        providerConfigPresent: cfg.channels?.sms !== undefined,
        // SMS is direct-only (no group chat surface), so there is no group
        // policy to reconcile — only the sender-restriction warning applies.
        configuredGroupPolicy: undefined,
        surface: "SMS",
        openScope: "any sender",
        groupPolicyPath: "channels.sms.dmPolicy",
        groupAllowFromPath: "channels.sms.allowFrom",
        mentionGated: false,
      });
    },
  },
  messaging: {
    // The adapter contract is `string | undefined`; PR-2's normalizer returns ""
    // for unusable input, so collapse that to undefined like the signal peer.
    normalizeTarget: (raw) => normalizeSmsPhoneNumber(raw) || undefined,
    targetResolver: {
      looksLikeId: looksLikeSmsPhoneNumber,
      hint: "<E.164 phone, e.g. +15551234567>",
    },
  },
  setup: {
    resolveAccountId: ({ accountId }) => normalizeAccountId(accountId),
    applyAccountName: ({ cfg, accountId, name }) =>
      applyAccountNameToChannelSection({
        cfg,
        channelKey: "sms",
        accountId,
        name,
      }),
    validateInput: ({ accountId, input }) => {
      if (input.useEnv && accountId !== DEFAULT_ACCOUNT_ID) {
        return "SMS env vars can only be used for the default account.";
      }
      // ChannelSetupInput has no accountSid/fromNumber/messagingServiceSid
      // slots, so Twilio identity is supplied via TWILIO_* env vars (--use-env)
      // or by editing channels.sms directly. --token seeds the auth token only.
      if (!input.useEnv && !input.token) {
        return "SMS requires --use-env (TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_PHONE_NUMBER) or --token.";
      }
      return null;
    },
    applyAccountConfig: ({ cfg, accountId, input }) => {
      const namedConfig = applyAccountNameToChannelSection({
        cfg,
        channelKey: "sms",
        accountId,
        name: input.name,
      });
      const next =
        accountId !== DEFAULT_ACCOUNT_ID
          ? migrateBaseNameToDefaultAccount({
              cfg: namedConfig,
              channelKey: "sms",
            })
          : namedConfig;
      const webhookPath = input.webhookPath?.trim();
      const publicWebhookUrl = input.webhookUrl?.trim();
      const patch = input.useEnv
        ? {}
        : {
            ...(input.token ? { authToken: input.token } : {}),
            ...(webhookPath ? { webhookPath } : {}),
            ...(publicWebhookUrl ? { publicWebhookUrl } : {}),
          };
      return applySetupAccountConfigPatch({
        cfg: next,
        channelKey: "sms",
        accountId,
        patch,
      });
    },
  },
  outbound: {
    deliveryMode: "direct",
    // Same splitter PR-1's sendSmsTextChunks uses internally, so the core-level
    // chunk pass and the send-level pass agree and the second is a no-op.
    chunker: (text, limit) => chunkTextForOutbound(text, limit),
    chunkerMode: "text",
    textChunkLimit: 1500,
    // SMS is text-only: no sendMedia (MMS is out of scope for this channel).
    sendText: async ({ cfg, to, text, accountId }) => {
      const account = resolveSmsAccount(cfg, accountId);
      const results = await sendSmsTextChunks({ account, to, text });
      // Twilio returns one message per SMS segment; OutboundDeliveryResult is
      // singular. Report the LAST segment's sid as the canonical messageId (it
      // is the reply the recipient sees last / replies to) and keep every sid
      // plus the segment count under `meta` so nothing is lost.
      const last = results.at(-1);
      return {
        channel: "sms",
        messageId: last?.sid ?? "",
        meta: {
          segmentCount: results.length,
          messageSids: results.map((result) => result.sid),
          ...(last?.status ? { status: last.status } : {}),
          ...(last?.from ? { from: last.from } : {}),
          to,
        },
      };
    },
  },
  status: {
    defaultRuntime: createDefaultChannelRuntimeState(DEFAULT_ACCOUNT_ID),
    collectStatusIssues: (accounts) => collectStatusIssuesFromLastError("sms", accounts),
    buildChannelSummary: ({ snapshot }) => ({
      ...buildBaseChannelStatusSummary(snapshot),
      probe: snapshot.probe,
    }),
    probeAccount: async ({ account, timeoutMs }) => await probeSmsAccount({ account, timeoutMs }),
    buildAccountSnapshot: ({ account, runtime, probe }) =>
      buildBaseAccountStatusSnapshot({
        account: {
          accountId: account.accountId,
          enabled: account.enabled,
          configured: isSmsAccountConfigured(account),
        },
        runtime,
        probe,
      }),
  },
  // No `gateway` block: PR-3 ships a send-only channel. The inbound webhook
  // (and its gateway adapter) lands in PR-4, which is reviewed separately.
};
