// Extension Package Boundary script supports RemoteClaw repository automation.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, posix, resolve } from "node:path";
import { privateLocalOnlyPluginSdkEntrypoints } from "./plugin-sdk-entries.mjs";

export const EXTENSION_PACKAGE_BOUNDARY_INCLUDE = ["./*.ts", "./src/**/*.ts"] as const;
export const EXTENSION_PACKAGE_BOUNDARY_EXCLUDE = [
  "./**/*.test.ts",
  "./dist/**",
  "./node_modules/**",
  "./src/test-support/**",
  "./src/**/*test-helpers.ts",
  "./src/**/*test-harness.ts",
  "./src/**/*test-support.ts",
] as const;

const privateLocalOnlyPluginSdkPackageDtsPaths = Object.fromEntries(
  privateLocalOnlyPluginSdkEntrypoints.map((entrypoint) => [
    `remoteclaw/plugin-sdk/${entrypoint}`,
    [`../packages/plugin-sdk/dist/src/plugin-sdk/${entrypoint}.d.ts`],
  ]),
) as Record<string, readonly string[]>;

export const EXTENSION_PACKAGE_BOUNDARY_BASE_PATHS = {
  "remoteclaw/extension-api": ["../src/extensionAPI.ts"],
  "remoteclaw/plugin-sdk": ["../dist/plugin-sdk/index.d.ts"],
  "remoteclaw/plugin-sdk/*": ["../dist/plugin-sdk/*.d.ts"],
  ...privateLocalOnlyPluginSdkPackageDtsPaths,
  "remoteclaw/plugin-sdk/account-id": ["../dist/plugin-sdk/account-id.d.ts"],
  "remoteclaw/plugin-sdk/channel-entry-contract": [
    "../dist/plugin-sdk/channel-entry-contract.d.ts",
  ],
  "remoteclaw/plugin-sdk/browser-maintenance": [
    "../packages/plugin-sdk/dist/extensions/browser/browser-maintenance.d.ts",
  ],
  "remoteclaw/plugin-sdk/channel-secret-basic-runtime": [
    "../dist/plugin-sdk/channel-secret-basic-runtime.d.ts",
  ],
  "remoteclaw/plugin-sdk/channel-secret-runtime": [
    "../dist/plugin-sdk/channel-secret-runtime.d.ts",
  ],
  "remoteclaw/plugin-sdk/channel-secret-tts-runtime": [
    "../dist/plugin-sdk/channel-secret-tts-runtime.d.ts",
  ],
  "remoteclaw/plugin-sdk/channel-streaming": ["../dist/plugin-sdk/channel-streaming.d.ts"],
  "remoteclaw/plugin-sdk/error-runtime": ["../dist/plugin-sdk/error-runtime.d.ts"],
  "remoteclaw/plugin-sdk/provider-catalog-live-runtime": [
    "../dist/plugin-sdk/provider-catalog-live-runtime.d.ts",
  ],
  "remoteclaw/plugin-sdk/provider-catalog-shared": [
    "../dist/plugin-sdk/provider-catalog-shared.d.ts",
  ],
  "remoteclaw/plugin-sdk/provider-entry": ["../dist/plugin-sdk/provider-entry.d.ts"],
  "remoteclaw/plugin-sdk/secret-ref-runtime": ["../dist/plugin-sdk/secret-ref-runtime.d.ts"],
  "remoteclaw/plugin-sdk/ssrf-runtime": ["../dist/plugin-sdk/ssrf-runtime.d.ts"],
  "@remoteclaw/qa-channel/api.js": ["../dist/plugin-sdk/extensions/qa-channel/api.d.ts"],
  "@remoteclaw/discord/api.js": ["../dist/plugin-sdk/extensions/discord/api.d.ts"],
  "@remoteclaw/slack/api.js": ["../dist/plugin-sdk/extensions/slack/api.d.ts"],
  "@remoteclaw/whatsapp/api.js": ["../dist/plugin-sdk/extensions/whatsapp/api.d.ts"],
  "@remoteclaw/*.js": ["../packages/plugin-sdk/dist/extensions/*.d.ts", "../extensions/*"],
  "@remoteclaw/*": ["../packages/plugin-sdk/dist/extensions/*", "../extensions/*"],
  "remoteclaw/plugin-sdk/qa-channel": ["../dist/plugin-sdk/src/plugin-sdk/qa-channel.d.ts"],
  "remoteclaw/plugin-sdk/qa-channel-protocol": [
    "../dist/plugin-sdk/src/plugin-sdk/qa-channel-protocol.d.ts",
  ],
  "remoteclaw/plugin-sdk/qa-runtime": ["../dist/plugin-sdk/src/plugin-sdk/qa-runtime.d.ts"],
  "@remoteclaw/plugin-sdk/*": ["../dist/plugin-sdk/*.d.ts"],
} as const;

function prefixExtensionPackageBoundaryPaths(
  paths: Record<string, readonly string[]>,
  prefix: string,
): Record<string, readonly string[]> {
  return Object.fromEntries(
    Object.entries(paths).map(([key, values]) => [
      key,
      values.map((value) => posix.join(prefix, value)),
    ]),
  );
}

export const EXTENSION_PACKAGE_BOUNDARY_XAI_PATHS = {
  ...prefixExtensionPackageBoundaryPaths(
    (({
      "remoteclaw/plugin-sdk/channel-secret-basic-runtime": _omitBasic,
      "remoteclaw/plugin-sdk/channel-secret-tts-runtime": _omitTts,
      "@remoteclaw/discord/api.js": _omitDiscord,
      "@remoteclaw/slack/api.js": _omitSlack,
      "@remoteclaw/whatsapp/api.js": _omitWhatsApp,
      ...rest
    }) => rest)(EXTENSION_PACKAGE_BOUNDARY_BASE_PATHS),
    "../",
  ),
  "remoteclaw/plugin-sdk/channel-entry-contract": [
    "../../dist/plugin-sdk/channel-entry-contract.d.ts",
  ],
  "remoteclaw/plugin-sdk/browser-maintenance": [
    "../../dist/plugin-sdk/src/plugin-sdk/browser-maintenance.d.ts",
  ],
  "remoteclaw/plugin-sdk/cli-runtime": ["../../dist/plugin-sdk/cli-runtime.d.ts"],
  "remoteclaw/plugin-sdk/provider-catalog-live-runtime": [
    "../../dist/plugin-sdk/provider-catalog-live-runtime.d.ts",
  ],
  "remoteclaw/plugin-sdk/provider-catalog-shared": [
    "../../dist/plugin-sdk/provider-catalog-shared.d.ts",
  ],
  "remoteclaw/plugin-sdk/provider-env-vars": ["../../dist/plugin-sdk/provider-env-vars.d.ts"],
  "remoteclaw/plugin-sdk/provider-entry": ["../../dist/plugin-sdk/provider-entry.d.ts"],
  "remoteclaw/plugin-sdk/provider-web-search-contract": [
    "../../dist/plugin-sdk/provider-web-search-contract.d.ts",
  ],
  "@remoteclaw/qa-channel/api.js": ["../../dist/plugin-sdk/extensions/qa-channel/api.d.ts"],
  "@remoteclaw/*.js": ["../../packages/plugin-sdk/dist/extensions/*.d.ts", "../*"],
  "@remoteclaw/*": ["../*"],
  "@remoteclaw/plugin-sdk/*": ["../../dist/plugin-sdk/*.d.ts"],
  "@remoteclaw/anthropic-vertex/api.js": ["./.boundary-stubs/anthropic-vertex-api.d.ts"],
  "@remoteclaw/ollama/api.js": ["./.boundary-stubs/ollama-api.d.ts"],
  "@remoteclaw/ollama/runtime-api.js": ["./.boundary-stubs/ollama-runtime-api.d.ts"],
  "@remoteclaw/speech-core/runtime-api.js": ["./.boundary-stubs/speech-core-runtime-api.d.ts"],
} as const;

type ExtensionPackageBoundaryTsConfigJson = {
  extends?: unknown;
  compilerOptions?: {
    rootDir?: unknown;
    paths?: unknown;
  };
  include?: unknown;
  exclude?: unknown;
};

type ExtensionPackageBoundaryPackageJson = {
  devDependencies?: Record<string, string>;
};

// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- Boundary helper lets callers ascribe JSON file shape.
function readJsonFile<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function collectBundledExtensionIds(rootDir = resolve(".")): string[] {
  return readdirSync(join(rootDir, "extensions"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .toSorted();
}

function resolveExtensionTsconfigPath(extensionId: string, rootDir = resolve(".")): string {
  return join(rootDir, "extensions", extensionId, "tsconfig.json");
}

function resolveExtensionPackageJsonPath(extensionId: string, rootDir = resolve(".")): string {
  return join(rootDir, "extensions", extensionId, "package.json");
}

export function readExtensionPackageBoundaryTsconfig(
  extensionId: string,
  rootDir = resolve("."),
): ExtensionPackageBoundaryTsConfigJson {
  return readJsonFile<ExtensionPackageBoundaryTsConfigJson>(
    resolveExtensionTsconfigPath(extensionId, rootDir),
  );
}

export function readExtensionPackageBoundaryPackageJson(
  extensionId: string,
  rootDir = resolve("."),
): ExtensionPackageBoundaryPackageJson {
  return readJsonFile<ExtensionPackageBoundaryPackageJson>(
    resolveExtensionPackageJsonPath(extensionId, rootDir),
  );
}

export function isOptInExtensionPackageBoundaryTsconfig(
  tsconfig: ExtensionPackageBoundaryTsConfigJson,
): boolean {
  return tsconfig.extends === "../tsconfig.package-boundary.base.json";
}

export function collectExtensionsWithTsconfig(rootDir = resolve(".")): string[] {
  return collectBundledExtensionIds(rootDir).filter((extensionId) =>
    existsSync(resolveExtensionTsconfigPath(extensionId, rootDir)),
  );
}

export function collectOptInExtensionPackageBoundaries(rootDir = resolve(".")): string[] {
  return collectExtensionsWithTsconfig(rootDir).filter((extensionId) =>
    isOptInExtensionPackageBoundaryTsconfig(
      readExtensionPackageBoundaryTsconfig(extensionId, rootDir),
    ),
  );
}
