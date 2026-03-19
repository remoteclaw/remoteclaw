import { describe, expect, it } from "vitest";
import { buildPluginSdkPackageExports } from "./entrypoints.js";

async function collectRuntimeExports(filePath: string, seen = new Set<string>()) {
  const normalizedPath = path.resolve(filePath);
  if (seen.has(normalizedPath)) {
    return new Set<string>();
  }
  seen.add(normalizedPath);

  const source = await fs.readFile(normalizedPath, "utf8");
  const exportNames = new Set<string>();

  for (const match of source.matchAll(/export\s+(?!type\b)\{([\s\S]*?)\}\s+from\s+"([^"]+)";/g)) {
    const names = match[1]
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => part.split(/\s+as\s+/).at(-1) ?? part);
    for (const name of names) {
      exportNames.add(name);
    }
  }

  for (const match of source.matchAll(/export\s+\*\s+from\s+"([^"]+)";/g)) {
    const specifier = match[1];
    if (!specifier.startsWith(".")) {
      continue;
    }
    const nestedPath = path.resolve(
      path.dirname(normalizedPath),
      specifier.replace(/\.js$/, ".ts"),
    );
    const nestedExports = await collectRuntimeExports(nestedPath, seen);
    for (const name of nestedExports) {
      exportNames.add(name);
    }
  }

  return exportNames;
}

describe("plugin-sdk exports", () => {
  it("does not expose runtime modules", async () => {
    const runtimeExports = await collectRuntimeExports(path.join(import.meta.dirname, "index.ts"));
    const forbidden = [
      "chunkMarkdownText",
      "chunkText",
      "hasControlCommand",
      "isControlCommandMessage",
      "shouldComputeCommandAuthorized",
      "shouldHandleTextCommands",
      "buildMentionRegexes",
      "matchesMentionPatterns",
      "resolveStateDir",
      "writeConfigFile",
      "enqueueSystemEvent",
      "fetchRemoteMedia",
      "saveMediaBuffer",
      "formatAgentEnvelope",
      "buildPairingReply",
      "resolveAgentRoute",
      "dispatchReplyFromConfig",
      "createReplyDispatcherWithTyping",
      "dispatchReplyWithBufferedBlockDispatcher",
      "resolveCommandAuthorizedFromAuthorizers",
      "monitorSlackProvider",
      "monitorTelegramProvider",
      "monitorIMessageProvider",
      "monitorSignalProvider",
      "sendMessageSlack",
      "sendMessageTelegram",
      "sendMessageIMessage",
      "sendMessageSignal",
      "sendMessageWhatsApp",
      "probeSlack",
      "probeTelegram",
      "probeIMessage",
      "probeSignal",
    ];

    for (const key of forbidden) {
      expect(runtimeExports.has(key)).toBe(false);
    }
  });

  it("keeps the root runtime surface intentionally small", () => {
    expect(typeof sdk.emptyPluginConfigSchema).toBe("function");
    expect(typeof sdk.delegateCompactionToRuntime).toBe("function");
    expect(Object.prototype.hasOwnProperty.call(sdk, "resolveControlCommandGate")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(sdk, "buildAgentSessionKey")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(sdk, "isDangerousNameMatchingEnabled")).toBe(false);
  });

  it("emits importable bundled subpath entries", { timeout: 240_000 }, async () => {
    const outDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-plugin-sdk-build-"));
    const fixtureDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-plugin-sdk-consumer-"));

    try {
      const buildScriptPath = path.join(fixtureDir, "build-plugin-sdk.mjs");
      await fs.writeFile(
        buildScriptPath,
        `import { build } from ${JSON.stringify(tsdownModuleUrl)};
await build(${JSON.stringify({
          clean: true,
          config: false,
          dts: false,
          entry: buildPluginSdkEntrySources(),
          env: { NODE_ENV: "production" },
          fixedExtension: false,
          logLevel: "error",
          outDir,
          platform: "node",
        })});
`,
      );
      await execFileAsync(process.execPath, [buildScriptPath], {
        cwd: process.cwd(),
      });
      await fs.symlink(
        path.join(process.cwd(), "node_modules"),
        path.join(outDir, "node_modules"),
        "dir",
      );

      for (const entry of pluginSdkEntrypoints) {
        const module = await import(pathToFileURL(path.join(outDir, `${entry}.js`)).href);
        expect(module).toBeTypeOf("object");
      }

      const packageDir = path.join(fixtureDir, "openclaw");
      const consumerDir = path.join(fixtureDir, "consumer");
      const consumerEntry = path.join(consumerDir, "import-plugin-sdk.mjs");

      await fs.mkdir(path.join(packageDir, "dist"), { recursive: true });
      await fs.symlink(outDir, path.join(packageDir, "dist", "plugin-sdk"), "dir");
      // Mirror the installed package layout so subpaths can resolve root deps.
      await fs.symlink(
        path.join(process.cwd(), "node_modules"),
        path.join(packageDir, "node_modules"),
        "dir",
      );
      await fs.writeFile(
        path.join(packageDir, "package.json"),
        JSON.stringify(
          {
            exports: buildPluginSdkPackageExports(),
            name: "openclaw",
            type: "module",
          },
          null,
          2,
        ),
      );

      await fs.mkdir(path.join(consumerDir, "node_modules"), { recursive: true });
      await fs.symlink(packageDir, path.join(consumerDir, "node_modules", "openclaw"), "dir");
      await fs.writeFile(
        consumerEntry,
        [
          `const specifiers = ${JSON.stringify(pluginSdkSpecifiers)};`,
          "const results = {};",
          "for (const specifier of specifiers) {",
          "  results[specifier] = typeof (await import(specifier));",
          "}",
          "export default results;",
        ].join("\n"),
      );

      const { default: importResults } = await import(pathToFileURL(consumerEntry).href);
      expect(importResults).toEqual(
        Object.fromEntries(pluginSdkSpecifiers.map((specifier: string) => [specifier, "object"])),
      );
    } finally {
      await fs.rm(outDir, { recursive: true, force: true });
      await fs.rm(fixtureDir, { recursive: true, force: true });
    }
  });

  it("keeps package.json plugin-sdk exports synced with the manifest", async () => {
    const packageJsonPath = path.join(process.cwd(), "package.json");
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf8")) as {
      exports?: Record<string, unknown>;
    };
    const currentPluginSdkExports = Object.fromEntries(
      Object.entries(packageJson.exports ?? {}).filter(([key]) => key.startsWith("./plugin-sdk")),
    );

    expect(currentPluginSdkExports).toEqual(buildPluginSdkPackageExports());
  });
});
