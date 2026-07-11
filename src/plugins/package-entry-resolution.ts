import fs from "node:fs";
import path from "node:path";
import { openBoundaryFile } from "../infra/boundary-file-read.js";
import { resolveBoundaryPath } from "../infra/boundary-path.js";
import type { PackageManifest } from "./manifest.js";
import {
  isTypeScriptPackageEntry,
  listBuiltRuntimeEntryCandidates,
} from "./package-entrypoints.js";

type ExtensionEntryValidation = { ok: true; exists: boolean } | { ok: false; error: string };

type RuntimeExtensionsResolution =
  | { ok: true; runtimeExtensions: string[] }
  | { ok: false; error: string };

function resolvePackageRuntimeExtensionEntries(): RuntimeExtensionsResolution {
  // The fork's package manifest does not carry remoteclaw.runtimeExtensions;
  // compiled runtime entries are inferred per-extension during validation below.
  return { ok: true, runtimeExtensions: [] };
}

function missingCompiledRuntimeEntryMessage(params: {
  label: string;
  entry: string;
  candidates: readonly string[];
}): string {
  return `${params.label} requires compiled runtime output for TypeScript entry ${params.entry}: expected ${params.candidates.join(", ")}. This is a plugin packaging issue, not a local config problem; update or reinstall the plugin after the publisher ships compiled JavaScript, or disable/uninstall the plugin until then. TypeScript source fallback is only supported for source checkouts and local development paths.`;
}

async function validatePackageExtensionEntry(params: {
  packageDir: string;
  entry: string;
  label: string;
  requireExisting: boolean;
}): Promise<ExtensionEntryValidation> {
  const absolutePath = path.resolve(params.packageDir, params.entry);
  try {
    const resolved = await resolveBoundaryPath({
      absolutePath,
      rootPath: params.packageDir,
      boundaryLabel: "plugin package directory",
    });
    if (!resolved.exists) {
      return params.requireExisting
        ? { ok: false, error: `${params.label} not found: ${params.entry}` }
        : { ok: true, exists: false };
    }
  } catch {
    return {
      ok: false,
      error: `${params.label} escapes plugin directory: ${params.entry}`,
    };
  }

  const opened = await openBoundaryFile({
    absolutePath,
    rootPath: params.packageDir,
    boundaryLabel: "plugin package directory",
  });
  if (!opened.ok) {
    if (opened.reason === "path") {
      return { ok: false, error: `${params.label} not found: ${params.entry}` };
    }
    if (opened.reason === "io") {
      return { ok: false, error: `${params.label} unreadable: ${params.entry}` };
    }
    return {
      ok: false,
      error: `${params.label} failed plugin directory boundary checks: ${params.entry}`,
    };
  }
  fs.closeSync(opened.fd);
  return { ok: true, exists: true };
}

export async function validatePackageExtensionEntriesForInstall(params: {
  packageDir: string;
  extensions: string[];
  manifest: PackageManifest;
  allowSourceTypeScriptEntries?: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const runtimeResolution = resolvePackageRuntimeExtensionEntries();
  if (!runtimeResolution.ok) {
    return runtimeResolution;
  }

  for (const [index, entry] of params.extensions.entries()) {
    const sourceEntry = await validatePackageExtensionEntry({
      packageDir: params.packageDir,
      entry,
      label: "extension entry",
      requireExisting: false,
    });
    if (!sourceEntry.ok) {
      return sourceEntry;
    }

    const runtimeEntry = runtimeResolution.runtimeExtensions[index];
    if (runtimeEntry) {
      const runtimeResult = await validatePackageExtensionEntry({
        packageDir: params.packageDir,
        entry: runtimeEntry,
        label: "runtime extension entry",
        requireExisting: true,
      });
      if (!runtimeResult.ok) {
        return runtimeResult;
      }
      continue;
    }

    let foundBuiltEntry = false;
    const builtEntryCandidates = listBuiltRuntimeEntryCandidates(entry);
    for (const builtEntry of builtEntryCandidates) {
      const builtResult = await validatePackageExtensionEntry({
        packageDir: params.packageDir,
        entry: builtEntry,
        label: "inferred runtime extension entry",
        requireExisting: false,
      });
      if (!builtResult.ok) {
        return builtResult;
      }
      if (builtResult.exists) {
        foundBuiltEntry = true;
        break;
      }
    }

    if (foundBuiltEntry) {
      continue;
    }

    if (
      sourceEntry.exists &&
      isTypeScriptPackageEntry(entry) &&
      params.allowSourceTypeScriptEntries
    ) {
      continue;
    }

    if (sourceEntry.exists && isTypeScriptPackageEntry(entry)) {
      return {
        ok: false,
        error: missingCompiledRuntimeEntryMessage({
          label: "package install",
          entry,
          candidates: builtEntryCandidates,
        }),
      };
    }

    if (sourceEntry.exists) {
      continue;
    }

    if (builtEntryCandidates.length > 0) {
      return {
        ok: false,
        error: missingCompiledRuntimeEntryMessage({
          label: "package install",
          entry,
          candidates: builtEntryCandidates,
        }),
      };
    }

    return { ok: false, error: `extension entry not found: ${entry}` };
  }

  return { ok: true };
}
