import { inspectSlackAccount as inspectSlackAccountImpl } from "remoteclaw/plugin-sdk/slack";

export type { InspectedSlackAccount } from "remoteclaw/plugin-sdk/slack";

type InspectSlackAccount = typeof import("remoteclaw/plugin-sdk/slack").inspectSlackAccount;

export function inspectSlackAccount(
  ...args: Parameters<InspectSlackAccount>
): ReturnType<InspectSlackAccount> {
  return inspectSlackAccountImpl(...args);
}
