import os from "node:os";
import path from "node:path";

const UNICODE_SPACES = /[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g;

function expandPath(filePath: string): string {
  const normalized = filePath.replace(UNICODE_SPACES, " ");
  if (normalized === "~") {
    return os.homedir();
  }
  if (normalized.startsWith("~/")) {
    return os.homedir() + normalized.slice(1);
  }
  return normalized;
}

function resolveSandboxInputPath(filePath: string, cwd: string): string {
  const expanded = expandPath(filePath);
  if (path.isAbsolute(expanded)) {
    return expanded;
  }
  return path.resolve(cwd, expanded);
}

type RelativePathOptions = {
  allowRoot?: boolean;
  cwd?: string;
  boundaryLabel?: string;
  includeRootInError?: boolean;
};

function toRelativePathUnderRoot(params: {
  root: string;
  candidate: string;
  options?: RelativePathOptions;
}): string {
  const rootResolved = path.resolve(params.root);
  const resolvedCandidate = path.resolve(
    resolveSandboxInputPath(params.candidate, params.options?.cwd ?? params.root),
  );
  const relative = path.relative(rootResolved, resolvedCandidate);
  if (relative === "" || relative === ".") {
    if (params.options?.allowRoot) {
      return "";
    }
    const boundary = params.options?.boundaryLabel ?? "workspace root";
    const suffix = params.options?.includeRootInError ? ` (${rootResolved})` : "";
    throw new Error(`Path escapes ${boundary}${suffix}: ${params.candidate}`);
  }
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    const boundary = params.options?.boundaryLabel ?? "workspace root";
    const suffix = params.options?.includeRootInError ? ` (${rootResolved})` : "";
    throw new Error(`Path escapes ${boundary}${suffix}: ${params.candidate}`);
  }
  return relative;
}

export function toRelativeWorkspacePath(
  root: string,
  candidate: string,
  options?: Pick<RelativePathOptions, "allowRoot" | "cwd">,
): string {
  return toRelativePathUnderRoot({
    root,
    candidate,
    options: {
      allowRoot: options?.allowRoot,
      cwd: options?.cwd,
      boundaryLabel: "workspace root",
    },
  });
}

export function toRelativeSandboxPath(
  root: string,
  candidate: string,
  options?: Pick<RelativePathOptions, "allowRoot" | "cwd">,
): string {
  return toRelativePathUnderRoot({
    root,
    candidate,
    options: {
      allowRoot: options?.allowRoot,
      cwd: options?.cwd,
      boundaryLabel: "sandbox root",
      includeRootInError: true,
    },
  });
}

export function resolvePathFromInput(filePath: string, cwd: string): string {
  return path.normalize(resolveSandboxInputPath(filePath, cwd));
}
