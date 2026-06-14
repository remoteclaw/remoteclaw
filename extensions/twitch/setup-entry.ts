import { defineBundledChannelSetupEntry } from "remoteclaw/plugin-sdk/channel-entry-contract";

export default defineBundledChannelSetupEntry({
  importMetaUrl: import.meta.url,
  plugin: {
    specifier: "./setup-plugin-api.js",
    exportName: "twitchSetupPlugin",
  },
});
