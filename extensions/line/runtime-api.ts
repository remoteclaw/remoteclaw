// Private runtime barrel for the bundled LINE extension.
// Keep this barrel thin and aligned with the local extension surface.

export * from "remoteclaw/plugin-sdk/line";
export {
  formatDocsLink,
  setSetupChannelEnabled,
  splitSetupEntries,
  type ChannelSetupDmPolicy,
  type ChannelSetupWizard,
} from "remoteclaw/plugin-sdk/line-core";
