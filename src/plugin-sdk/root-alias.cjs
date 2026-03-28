"use strict";

const path = require("node:path");
const fs = require("node:fs");

let monolithicSdk = null;
const shouldPreferSourceInTests = Boolean(process.env.VITEST) || process.env.NODE_ENV === "test";

function emptyPluginConfigSchema() {
  function error(message) {
    return { success: false, error: { issues: [{ path: [], message }] } };
  }

  return {
    safeParse(value) {
      if (value === undefined) {
        return { success: true, data: undefined };
      }
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return error("expected config object");
      }
      if (Object.keys(value).length > 0) {
        return error("config must be empty");
      }
      return { success: true, data: value };
    },
    jsonSchema: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
  };
}

function resolveCommandAuthorizedFromAuthorizers(params) {
  const { useAccessGroups, authorizers } = params;
  const mode = params.modeWhenAccessGroupsOff ?? "allow";
  if (!useAccessGroups) {
    if (mode === "allow") {
      return true;
    }
    if (mode === "deny") {
      return false;
    }
    const anyConfigured = authorizers.some((entry) => entry.configured);
    if (!anyConfigured) {
      return true;
    }
    return authorizers.some((entry) => entry.configured && entry.allowed);
  }
  return authorizers.some((entry) => entry.configured && entry.allowed);
}

function resolveControlCommandGate(params) {
  const commandAuthorized = resolveCommandAuthorizedFromAuthorizers({
    useAccessGroups: params.useAccessGroups,
    authorizers: params.authorizers,
    modeWhenAccessGroupsOff: params.modeWhenAccessGroupsOff,
  });
  const shouldBlock = params.allowTextCommands && params.hasControlCommand && !commandAuthorized;
  return { commandAuthorized, shouldBlock };
}

function onDiagnosticEvent(listener) {
  const monolithic = loadMonolithicSdk();
  if (!monolithic || typeof monolithic.onDiagnosticEvent !== "function") {
    throw new Error("remoteclaw/plugin-sdk root alias could not resolve onDiagnosticEvent");
  }
  return monolithic.onDiagnosticEvent(listener);
}

function getPackageRoot() {
  return path.resolve(__dirname, "..", "..");
}

function listPluginSdkExportedSubpaths() {
  const packageRoot = getPackageRoot();
  if (pluginSdkSubpathsCache.has(packageRoot)) {
    return pluginSdkSubpathsCache.get(packageRoot);
  }

  let subpaths = [];
  try {
    const packageJsonPath = path.join(packageRoot, "package.json");
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    subpaths = Object.keys(packageJson.exports ?? {})
      .filter((key) => key.startsWith("./plugin-sdk/"))
      .map((key) => key.slice("./plugin-sdk/".length));
  } catch {
    subpaths = [];
  }

  pluginSdkSubpathsCache.set(packageRoot, subpaths);
  return subpaths;
}

function buildPluginSdkAliasMap(useDist) {
  const packageRoot = getPackageRoot();
  const pluginSdkDir = path.join(packageRoot, useDist ? "dist" : "src", "plugin-sdk");
  const ext = useDist ? ".js" : ".ts";
  const aliasMap = {
    "remoteclaw/plugin-sdk": __filename,
  };

  for (const subpath of listPluginSdkExportedSubpaths()) {
    const candidate = path.join(pluginSdkDir, `${subpath}${ext}`);
    if (fs.existsSync(candidate)) {
      aliasMap[`openclaw/plugin-sdk/${subpath}`] = candidate;
    }
  }

  return aliasMap;
}

function getJiti(tryNative) {
  if (jitiLoaders.has(tryNative)) {
    return jitiLoaders.get(tryNative);
  }

  const { createJiti } = require("jiti");
  const jitiLoader = createJiti(__filename, {
    alias: buildPluginSdkAliasMap(tryNative),
    interopDefault: true,
    // Prefer Node's native sync ESM loader for built dist/plugin-sdk/*.js files
    // so local plugins do not create a second transpiled OpenClaw core graph.
    tryNative,
    extensions: [".ts", ".tsx", ".mts", ".cts", ".mtsx", ".ctsx", ".js", ".mjs", ".cjs", ".json"],
  });
  jitiLoaders.set(tryNative, jitiLoader);
  return jitiLoader;
}

function loadMonolithicSdk() {
  if (monolithicSdk) {
    return monolithicSdk;
  }

  const { createJiti } = require("jiti");
  const jiti = createJiti(__filename, {
    interopDefault: true,
    extensions: [".ts", ".tsx", ".mts", ".cts", ".mtsx", ".ctsx", ".js", ".mjs", ".cjs", ".json"],
  });

  const distCandidate = path.resolve(__dirname, "..", "..", "dist", "plugin-sdk", "compat.js");
  if (fs.existsSync(distCandidate)) {
    try {
      monolithicSdk = jiti(distCandidate);
      return monolithicSdk;
    } catch {
      // Fall through to source alias if dist is unavailable or stale.
    }
  }

  monolithicSdk = jiti(path.join(__dirname, "compat.ts"));
  return monolithicSdk;
}

const fastExports = {
  emptyPluginConfigSchema,
  onDiagnosticEvent,
  resolveControlCommandGate,
};

function shouldResolveMonolithic(prop) {
  if (typeof prop !== "string") {
    return false;
  }
  return prop !== "then";
}

const rootProxy = new Proxy(fastExports, {
  get(target, prop, receiver) {
    if (prop === "__esModule") {
      return true;
    }
    if (prop === "default") {
      return rootProxy;
    }
    if (Reflect.has(target, prop)) {
      return Reflect.get(target, prop, receiver);
    }
    if (!shouldResolveMonolithic(prop)) {
      return undefined;
    }
    return loadMonolithicSdk()[prop];
  },
  has(target, prop) {
    if (prop === "__esModule" || prop === "default") {
      return true;
    }
    if (Reflect.has(target, prop)) {
      return true;
    }
    if (!shouldResolveMonolithic(prop)) {
      return false;
    }
    return prop in loadMonolithicSdk();
  },
  ownKeys(target) {
    const keys = new Set([
      ...Reflect.ownKeys(target),
      ...Reflect.ownKeys(loadMonolithicSdk()),
      "default",
      "__esModule",
    ]);
    return [...keys];
  },
  getOwnPropertyDescriptor(target, prop) {
    if (prop === "__esModule") {
      return {
        configurable: true,
        enumerable: false,
        writable: false,
        value: true,
      };
    }
    if (prop === "default") {
      return {
        configurable: true,
        enumerable: false,
        writable: false,
        value: rootProxy,
      };
    }
    const own = Object.getOwnPropertyDescriptor(target, prop);
    if (own) {
      return own;
    }
    if (!shouldResolveMonolithic(prop)) {
      return undefined;
    }
    const descriptor = Object.getOwnPropertyDescriptor(loadMonolithicSdk(), prop);
    if (!descriptor) {
      return undefined;
    }
    if (descriptor.get || descriptor.set) {
      const monolithic = loadMonolithicSdk();
      return {
        configurable: true,
        enumerable: descriptor.enumerable ?? true,
        get: descriptor.get
          ? function getLegacyValue() {
              return descriptor.get.call(monolithic);
            }
          : undefined,
        set: descriptor.set
          ? function setLegacyValue(value) {
              return descriptor.set.call(monolithic, value);
            }
          : undefined,
      };
    }
    return {
      configurable: true,
      enumerable: descriptor.enumerable ?? true,
      value: descriptor.value,
      writable: descriptor.writable,
    };
  },
});

module.exports = rootProxy;
