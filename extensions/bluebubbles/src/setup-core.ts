import { setTopLevelChannelDmPolicyWithAllowFrom } from "../../../src/channels/plugins/onboarding/helpers.js";
import {
  createTopLevelChannelDmPolicySetter,
  normalizeAccountId,
  patchScopedAccountConfig,
  prepareScopedSetupConfig,
  type ChannelSetupAdapter,
  type DmPolicy,
  type RemoteClawConfig,
} from "remoteclaw/plugin-sdk/setup";
import { applyBlueBubblesConnectionConfig } from "./config-apply.js";

const channel = "bluebubbles" as const;
const setBlueBubblesTopLevelDmPolicy = createTopLevelChannelDmPolicySetter({
  channel,
});

export function setBlueBubblesDmPolicy(cfg: OpenClawConfig, dmPolicy: DmPolicy): OpenClawConfig {
  return setBlueBubblesTopLevelDmPolicy(cfg, dmPolicy);
}

export function setBlueBubblesAllowFrom(
  cfg: OpenClawConfig,
  accountId: string,
  allowFrom: string[],
): OpenClawConfig {
  return patchScopedAccountConfig({
    cfg,
    channelKey: channel,
    accountId,
    patch: { allowFrom },
    ensureChannelEnabled: false,
    ensureAccountEnabled: false,
  });
}

export const blueBubblesSetupAdapter: ChannelSetupAdapter = {
  resolveAccountId: ({ accountId }) => normalizeAccountId(accountId),
  applyAccountName: ({ cfg, accountId, name }) =>
    applyAccountNameToChannelSection({
      cfg,
      channelKey: channel,
      accountId,
      name,
    }),
  validateInput: ({ input }) => {
    if (!input.httpUrl && !input.password) {
      return "BlueBubbles requires --http-url and --password.";
    }
    if (!input.httpUrl) {
      return "BlueBubbles requires --http-url.";
    }
    if (!input.password) {
      return "BlueBubbles requires --password.";
    }
    return null;
  },
  applyAccountConfig: ({ cfg, accountId, input }) => {
    const namedConfig = applyAccountNameToChannelSection({
      cfg,
      channelKey: channel,
      accountId,
      name: input.name,
    });
    const next =
      accountId !== DEFAULT_ACCOUNT_ID
        ? migrateBaseNameToDefaultAccount({
            cfg: namedConfig,
            channelKey: channel,
          })
        : namedConfig;
    return applyBlueBubblesConnectionConfig({
      cfg: next,
      accountId,
      patch: {
        serverUrl: input.httpUrl,
        password: input.password,
        webhookPath: input.webhookPath,
      },
      onlyDefinedFields: true,
    });
  },
};
