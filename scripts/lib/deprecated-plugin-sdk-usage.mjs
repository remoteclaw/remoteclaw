import deprecatedPublicPluginSdkSubpaths from "./plugin-sdk-deprecated-public-subpaths.json" with { type: "json" };

const DEPRECATED_PLUGIN_SDK_EXTRA_SPECIFIERS = [
  "remoteclaw/plugin-sdk",
  "remoteclaw/plugin-sdk/agent-dir-compat",
  "remoteclaw/plugin-sdk/test-utils",
];

export function buildDeprecatedPluginSdkModuleSpecifiers(
  deprecatedSubpaths = deprecatedPublicPluginSdkSubpaths,
) {
  return [
    ...new Set([
      ...DEPRECATED_PLUGIN_SDK_EXTRA_SPECIFIERS,
      ...deprecatedSubpaths.map((subpath) => `remoteclaw/plugin-sdk/${subpath}`),
    ]),
  ].toSorted();
}
