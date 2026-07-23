// Packed Plugin Sdk Type Smoke script supports RemoteClaw repository automation.
type PublicPluginSdkModules = [
  typeof import("remoteclaw/plugin-sdk"),
  typeof import("remoteclaw/plugin-sdk/channel-entry-contract"),
  typeof import("remoteclaw/plugin-sdk/config-contracts"),
  typeof import("remoteclaw/plugin-sdk/provider-entry"),
  typeof import("remoteclaw/plugin-sdk/runtime-env"),
];

const resolvedModules = null as unknown as PublicPluginSdkModules;

void resolvedModules;
