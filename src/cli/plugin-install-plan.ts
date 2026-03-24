import type { BundledPluginSource } from "../plugins/bundled-sources.js";
import { PLUGIN_INSTALL_ERROR_CODE } from "../plugins/install.js";
import { shortenHomePath } from "../utils.js";

type BundledLookup = (params: {
  kind: "pluginId" | "npmSpec";
  value: string;
}) => BundledPluginSource | undefined;

export function resolveBundledInstallPlanForCatalogEntry(params: {
  pluginId: string;
  npmSpec: string;
  findBundledSource: BundledLookup;
}): { bundledSource: BundledPluginSource } | null {
  const pluginId = params.pluginId.trim();
  const npmSpec = params.npmSpec.trim();
  if (!pluginId || !npmSpec) {
    return null;
  }

  const bundledBySpec = params.findBundledSource({
    kind: "npmSpec",
    value: npmSpec,
  });
  if (bundledBySpec?.pluginId === pluginId) {
    return { bundledSource: bundledBySpec };
  }

  const bundledById = params.findBundledSource({
    kind: "pluginId",
    value: pluginId,
  });
  if (bundledById?.pluginId !== pluginId) {
    return null;
  }
  if (bundledById.npmSpec && bundledById.npmSpec !== npmSpec) {
    return null;
  }

  return { bundledSource: bundledById };
}

function isBareNpmPackageName(spec: string): boolean {
  const trimmed = spec.trim();
  return /^[a-z0-9][a-z0-9-._~]*$/.test(trimmed);
}

export function resolveBundledInstallPlanBeforeNpm(params: {
  rawSpec: string;
  findBundledSource: BundledLookup;
}): { bundledSource: BundledPluginSource; warning: string } | null {
  if (!isBareNpmPackageName(params.rawSpec)) {
    return null;
  }
  const bundledSource = params.findBundledSource({
    kind: "pluginId",
    value: params.rawSpec,
  });
  if (!bundledSource) {
    return null;
  }
  return {
    bundledSource,
    warning: `Using bundled plugin "${bundledSource.pluginId}" from ${shortenHomePath(bundledSource.localPath)} for bare install spec "${params.rawSpec}". To install an npm package with the same name, use a scoped package name (for example @scope/${params.rawSpec}).`,
  };
}

export function resolveBundledInstallPlanForNpmFailure(params: {
  rawSpec: string;
  code?: string;
  findBundledSource: BundledLookup;
}): { bundledSource: BundledPluginSource; warning: string } | null {
  const isNpmNotFound = params.code === PLUGIN_INSTALL_ERROR_CODE.NPM_PACKAGE_NOT_FOUND;
  const isNotPlugin =
    params.code === PLUGIN_INSTALL_ERROR_CODE.MISSING_REMOTECLAW_EXTENSIONS ||
    params.code === PLUGIN_INSTALL_ERROR_CODE.EMPTY_REMOTECLAW_EXTENSIONS;
  if (!isNpmNotFound && !isNotPlugin) {
    return null;
  }
  const bundledSource = params.findBundledSource({
    kind: "npmSpec",
    value: params.rawSpec,
  });
  if (!bundledSource) {
    return null;
  }
  return {
    bundledSource,
    warning: isNpmNotFound
      ? `npm package unavailable for ${params.rawSpec}; using bundled plugin at ${shortenHomePath(bundledSource.localPath)}.`
      : `npm package "${params.rawSpec}" is not a valid RemoteClaw plugin; using bundled plugin at ${shortenHomePath(bundledSource.localPath)}.`,
  };
}
