import { createPatchedAccountSetupAdapter } from "remoteclaw/plugin-sdk/setup";

const channel = "zalouser" as const;

export const zalouserSetupAdapter = createPatchedAccountSetupAdapter({
  channelKey: channel,
  validateInput: () => null,
  buildPatch: () => ({}),
});
