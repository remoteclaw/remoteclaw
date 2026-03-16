import {
  createDetectedBinaryStatus,
  setSetupChannelEnabled,
  type ChannelSetupWizard,
} from "remoteclaw/plugin-sdk/setup";
import { detectBinary } from "remoteclaw/plugin-sdk/setup-tools";
import { listIMessageAccountIds, resolveIMessageAccount } from "./accounts.js";
import {
  DEFAULT_ACCOUNT_ID,
  detectBinary,
  formatDocsLink,
  type RemoteClawConfig,
  parseSetupEntriesAllowingWildcard,
  promptParsedAllowFromForScopedChannel,
  setChannelDmPolicyWithAllowFrom,
  setSetupChannelEnabled,
} from "../../../src/channels/plugins/setup-wizard-helpers.js";
import type { ChannelSetupDmPolicy } from "../../../src/channels/plugins/setup-wizard-types.js";
import { type ChannelSetupWizard } from "../../../src/channels/plugins/setup-wizard.js";
import { detectBinary } from "../../../src/commands/onboard-helpers.js";
import type { RemoteClawConfig } from "../../../src/config/config.js";
import { DEFAULT_ACCOUNT_ID } from "../../../src/routing/session-key.js";
import { formatDocsLink } from "../../../src/terminal/links.js";
import type { WizardPrompter } from "../../../src/wizard/prompts.js";
import {
  listIMessageAccountIds,
  resolveDefaultIMessageAccountId,
  resolveIMessageAccount,
} from "./accounts.js";
import { imessageSetupAdapter, parseIMessageAllowFromEntries } from "./setup-core.js";

const channel = "imessage" as const;

async function promptIMessageAllowFrom(params: {
  cfg: RemoteClawConfig;
  prompter: WizardPrompter;
  accountId?: string;
}): Promise<RemoteClawConfig> {
  return promptParsedAllowFromForScopedChannel({
    cfg: params.cfg,
    channel,
    accountId: params.accountId,
    defaultAccountId: resolveDefaultIMessageAccountId(params.cfg),
    prompter: params.prompter,
    noteTitle: "iMessage allowlist",
    noteLines: [
      "Allowlist iMessage DMs by handle or chat target.",
      "Examples:",
      "- +15555550123",
      "- user@example.com",
      "- chat_id:123",
      "- chat_guid:... or chat_identifier:...",
      "Multiple entries: comma-separated.",
      `Docs: ${formatDocsLink("/imessage", "imessage")}`,
    ],
    message: "iMessage allowFrom (handle or chat_id)",
    placeholder: "+15555550123, user@example.com, chat_id:123",
    parseEntries: parseIMessageAllowFromEntries,
    getExistingAllowFrom: ({ cfg, accountId }) =>
      resolveIMessageAccount({ cfg, accountId }).config.allowFrom ?? [],
  });
}

const imessageDmPolicy: ChannelSetupDmPolicy = {
  label: "iMessage",
  channel,
  policyKey: "channels.imessage.dmPolicy",
  allowFromKey: "channels.imessage.allowFrom",
  getCurrent: (cfg) => cfg.channels?.imessage?.dmPolicy ?? "pairing",
  setPolicy: (cfg, policy) =>
    setChannelDmPolicyWithAllowFrom({
      cfg,
      channel,
      dmPolicy: policy,
    }),
  promptAllowFrom: promptIMessageAllowFrom,
};

export const imessageSetupWizard: ChannelSetupWizard = {
  channel,
  status: createDetectedBinaryStatus({
    channelLabel: "iMessage",
    binaryLabel: "imsg",
    configuredLabel: imessageSetupStatusBase.configuredLabel,
    unconfiguredLabel: imessageSetupStatusBase.unconfiguredLabel,
    configuredHint: imessageSetupStatusBase.configuredHint,
    unconfiguredHint: imessageSetupStatusBase.unconfiguredHint,
    configuredScore: imessageSetupStatusBase.configuredScore,
    unconfiguredScore: imessageSetupStatusBase.unconfiguredScore,
    resolveConfigured: imessageSetupStatusBase.resolveConfigured,
    resolveBinaryPath: ({ cfg }) => cfg.channels?.imessage?.cliPath ?? "imsg",
    detectBinary,
  }),
  credentials: [],
  textInputs: [
    {
      inputKey: "cliPath",
      message: "imsg CLI path",
      initialValue: ({ cfg, accountId }) =>
        resolveIMessageAccount({ cfg, accountId }).config.cliPath ?? "imsg",
      currentValue: ({ cfg, accountId }) =>
        resolveIMessageAccount({ cfg, accountId }).config.cliPath ?? "imsg",
      shouldPrompt: async ({ currentValue }) => !(await detectBinary(currentValue ?? "imsg")),
      confirmCurrentValue: false,
      applyCurrentValue: true,
      helpTitle: "iMessage",
      helpLines: ["imsg CLI path required to enable iMessage."],
    },
  ],
  completionNote: {
    title: "iMessage next steps",
    lines: [
      "This is still a work in progress.",
      "Ensure OpenClaw has Full Disk Access to Messages DB.",
      "Grant Automation permission for Messages when prompted.",
      "List chats with: imsg chats --limit 20",
      `Docs: ${formatDocsLink("/imessage", "imessage")}`,
    ],
  },
  dmPolicy: imessageDmPolicy,
  disable: (cfg) => setSetupChannelEnabled(cfg, channel, false),
};

export { imessageSetupAdapter, parseIMessageAllowFromEntries };
