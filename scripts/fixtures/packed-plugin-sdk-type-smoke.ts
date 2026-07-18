type PublicPluginSdkModules = [
  typeof import("openclaw/plugin-sdk"),
  typeof import("remoteclaw/plugin-sdk/channel-entry-contract"),
  typeof import("openclaw/plugin-sdk/config-contracts"),
  typeof import("remoteclaw/plugin-sdk/provider-entry"),
  typeof import("remoteclaw/plugin-sdk/runtime-env"),
];

const resolvedModules = null as unknown as PublicPluginSdkModules;

void resolvedModules;
