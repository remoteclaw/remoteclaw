import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  installRemoteClawPluginSdkNativeResolver,
  resetRemoteClawPluginSdkNativeResolverForTest,
} from "./plugin-sdk-native-resolver.js";

afterEach(() => {
  resetRemoteClawPluginSdkNativeResolverForTest();
});

function writeJsonFile(targetPath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeFakeRemoteClawPackage(root: string): { distRoot: string; loaderModulePath: string } {
  writeJsonFile(path.join(root, "package.json"), {
    name: "remoteclaw",
    type: "module",
    bin: {
      remoteclaw: "./remoteclaw.mjs",
    },
    exports: {
      "./cli-entry": "./dist/cli-entry.js",
      "./plugin-sdk": "./dist/plugin-sdk/root-alias.cjs",
      "./plugin-sdk/channel-message": "./dist/plugin-sdk/channel-message.js",
      "./plugin-sdk/source-only": "./dist/plugin-sdk/source-only.js",
    },
  });
  fs.writeFileSync(path.join(root, "remoteclaw.mjs"), "#!/usr/bin/env node\n", "utf8");
  const distRoot = path.join(root, "dist");
  const pluginSdkDir = path.join(distRoot, "plugin-sdk");
  fs.mkdirSync(pluginSdkDir, { recursive: true });
  fs.writeFileSync(path.join(pluginSdkDir, "root-alias.cjs"), "module.exports = {};\n", "utf8");
  fs.writeFileSync(
    path.join(pluginSdkDir, "channel-message.js"),
    ['export const defineChannelMessageAdapter = () => "adapter";', ""].join("\n"),
    "utf8",
  );
  const loaderModulePath = path.join(distRoot, "plugins", "loader.js");
  fs.mkdirSync(path.dirname(loaderModulePath), { recursive: true });
  fs.writeFileSync(loaderModulePath, "export default {};\n", "utf8");
  return { distRoot, loaderModulePath };
}

function writeExternalPluginEntry(root: string): string {
  writeJsonFile(path.join(root, "package.json"), {
    name: "external-plugin",
    type: "module",
  });
  const entry = path.join(root, "dist", "runtime-api.js");
  fs.mkdirSync(path.dirname(entry), { recursive: true });
  fs.writeFileSync(entry, "export default {};\n", "utf8");
  return entry;
}

describe("installRemoteClawPluginSdkNativeResolver", () => {
  it("keeps native aliases on JS dist artifacts when source files exist", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "remoteclaw-sdk-native-source-resolver-"));
    const { loaderModulePath } = writeFakeRemoteClawPackage(root);
    const sourceChannelMessagePath = path.join(root, "src", "plugin-sdk", "channel-message.ts");
    fs.mkdirSync(path.dirname(sourceChannelMessagePath), { recursive: true });
    fs.writeFileSync(sourceChannelMessagePath, "export const sourceOnly = true;\n", "utf8");
    const externalPluginEntry = writeExternalPluginEntry(path.join(root, "external-plugin"));

    const installedAliases = installRemoteClawPluginSdkNativeResolver({
      modulePath: loaderModulePath,
      pluginModulePath: externalPluginEntry,
      pluginSdkResolution: "src",
    });

    expect(installedAliases).toContain("remoteclaw/plugin-sdk/channel-message");
    const requireFromPlugin = createRequire(externalPluginEntry);
    expect(
      fs.realpathSync(requireFromPlugin.resolve("remoteclaw/plugin-sdk/channel-message")),
    ).toBe(fs.realpathSync(path.join(root, "dist", "plugin-sdk", "channel-message.js")));
  });

  it("lets built external plugins resolve RemoteClaw SDK subpaths with createRequire", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "remoteclaw-sdk-native-resolver-"));
    const { distRoot, loaderModulePath } = writeFakeRemoteClawPackage(root);
    const externalPluginEntry = writeExternalPluginEntry(path.join(root, "external-plugin"));

    const distMode = fs.statSync(distRoot).mode;
    if (process.platform !== "win32") {
      fs.chmodSync(distRoot, 0o555);
    }

    try {
      const installedAliases = installRemoteClawPluginSdkNativeResolver({
        modulePath: loaderModulePath,
        pluginModulePath: externalPluginEntry,
        pluginSdkResolution: "dist",
      });

      expect(installedAliases).toContain("remoteclaw/plugin-sdk/channel-message");
      expect(fs.existsSync(path.join(distRoot, "extensions"))).toBe(false);
      const requireFromPlugin = createRequire(externalPluginEntry);
      expect(
        fs.realpathSync(requireFromPlugin.resolve("remoteclaw/plugin-sdk/channel-message")),
      ).toBe(fs.realpathSync(path.join(root, "dist", "plugin-sdk", "channel-message.js")));
      const sdk = requireFromPlugin("remoteclaw/plugin-sdk/channel-message") as {
        defineChannelMessageAdapter?: () => string;
      };

      expect(sdk.defineChannelMessageAdapter?.()).toBe("adapter");
      expect(() =>
        requireFromPlugin.resolve("remoteclaw/not-plugin-sdk/channel-message"),
      ).toThrow();
    } finally {
      if (process.platform !== "win32") {
        fs.chmodSync(distRoot, distMode);
      }
    }
  });

  it("does not resolve SDK aliases for parents outside registered plugin roots", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "remoteclaw-sdk-native-guard-"));
    const { loaderModulePath } = writeFakeRemoteClawPackage(root);
    const externalPluginEntry = writeExternalPluginEntry(path.join(root, "external-plugin"));
    const unrelatedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "remoteclaw-sdk-native-outside-"));
    const unrelatedEntry = path.join(unrelatedRoot, "runtime-api.js");
    fs.mkdirSync(path.dirname(unrelatedEntry), { recursive: true });
    fs.writeFileSync(unrelatedEntry, "export default {};\n", "utf8");

    installRemoteClawPluginSdkNativeResolver({
      modulePath: loaderModulePath,
      pluginModulePath: externalPluginEntry,
      pluginSdkResolution: "dist",
    });

    const requireFromPlugin = createRequire(externalPluginEntry);
    const requireFromOutside = createRequire(unrelatedEntry);
    expect(requireFromPlugin.resolve("remoteclaw/plugin-sdk/channel-message")).toBeTruthy();
    expect(() => requireFromOutside.resolve("remoteclaw/plugin-sdk/channel-message")).toThrow();
  });

  it("does not register source-only SDK subpaths for native resolution", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "remoteclaw-sdk-native-source-only-"));
    const { loaderModulePath } = writeFakeRemoteClawPackage(root);
    const sourceOnlyPath = path.join(root, "src", "plugin-sdk", "source-only.ts");
    fs.mkdirSync(path.dirname(sourceOnlyPath), { recursive: true });
    fs.writeFileSync(sourceOnlyPath, "export const sourceOnly = true;\n", "utf8");
    const externalPluginEntry = writeExternalPluginEntry(path.join(root, "external-plugin"));

    const installedAliases = installRemoteClawPluginSdkNativeResolver({
      modulePath: loaderModulePath,
      pluginModulePath: externalPluginEntry,
      pluginSdkResolution: "src",
    });

    expect(installedAliases).toContain("remoteclaw/plugin-sdk/channel-message");
    expect(installedAliases).not.toContain("remoteclaw/plugin-sdk/source-only");
    const requireFromPlugin = createRequire(externalPluginEntry);
    expect(() => requireFromPlugin.resolve("remoteclaw/plugin-sdk/source-only")).toThrow();
  });
});
