import { resolveChannelGroupRequireMention } from "remoteclaw/plugin-sdk";
import type { RemoteClawConfig } from "remoteclaw/plugin-sdk/googlechat";

type GoogleChatGroupContext = {
  cfg: RemoteClawConfig;
  accountId?: string | null;
  groupId?: string | null;
};

export function resolveGoogleChatGroupRequireMention(params: GoogleChatGroupContext): boolean {
  return resolveChannelGroupRequireMention({
    cfg: params.cfg,
    channel: "googlechat",
    groupId: params.groupId,
    accountId: params.accountId,
  });
}
