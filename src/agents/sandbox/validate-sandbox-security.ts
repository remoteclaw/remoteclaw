// Gutted in RemoteClaw fork (Middleware Boundary Principle)
// The full sandbox runtime enforcement (validateSandboxSecurity,
// validateBindMounts, network/seccomp/apparmor validation) is intentionally
// omitted — CLI runtimes own their own sandboxing. This retains
// getBlockedBindReason for the config security audit
// (collectSandboxDangerousConfigFindings), including detection of home
// credential-directory binds (.ssh/.aws/.docker/…) and Windows drive-letter
// source paths.
import os from "node:os";
import path from "node:path";

export type BlockedBindReason =
  | { kind: "non_absolute"; sourcePath: string }
  | { kind: "covers"; blockedPath: string }
  | { kind: "targets"; blockedPath: string };

const BLOCKED_HOST_PATHS = [
  "/etc",
  "/private/etc",
  "/proc",
  "/sys",
  "/dev",
  "/root",
  "/boot",
  "/run",
  "/var/run",
  "/private/var/run",
  "/var/run/docker.sock",
  "/private/var/run/docker.sock",
  "/run/docker.sock",
];

// Home-relative directories that commonly hold credentials/config. Mounting any
// of them into a sandbox container risks credential exfiltration, so they are
// blocked relative to every resolvable home root.
const BLOCKED_HOME_SUBPATHS = [
  ".aws",
  ".cargo",
  ".config",
  ".docker",
  ".gnupg",
  ".netrc",
  ".npm",
  ".ssh",
] as const;

const DRIVE_LETTER_PREFIX = /^[A-Za-z]:[\\/]/;

function isAbsoluteHostPath(raw: string): boolean {
  return raw.startsWith("/") || DRIVE_LETTER_PREFIX.test(raw);
}

function parseBindSourcePath(bind: string): string {
  const trimmed = bind.trim();
  // Skip the Windows drive-letter colon (e.g. "D:/src") when locating the
  // host/container separator.
  const start = DRIVE_LETTER_PREFIX.test(trimmed) ? 2 : 0;
  for (let i = start; i < trimmed.length; i += 1) {
    if (trimmed[i] === ":") {
      return trimmed.slice(0, i);
    }
  }
  return trimmed;
}

function normalizeHostPath(raw: string): string {
  return path.posix.normalize(raw.replaceAll("\\", "/"));
}

function getBlockedHomePaths(): string[] {
  const roots = new Set<string>();
  for (const root of [os.homedir(), process.env.HOME, process.env.USERPROFILE]) {
    if (typeof root !== "string" || root.trim() === "") {
      continue;
    }
    const normalized = normalizeHostPath(root);
    if (normalized !== "/") {
      roots.add(normalized);
    }
  }
  const blocked: string[] = [];
  for (const root of roots) {
    for (const suffix of BLOCKED_HOME_SUBPATHS) {
      blocked.push(normalizeHostPath(path.posix.join(root, suffix)));
    }
  }
  return blocked;
}

export function getBlockedBindReason(bind: string): BlockedBindReason | undefined {
  const sourceRaw = parseBindSourcePath(bind);
  if (!isAbsoluteHostPath(sourceRaw)) {
    return { kind: "non_absolute", sourcePath: sourceRaw };
  }

  const normalized = normalizeHostPath(sourceRaw);

  if (normalized === "/") {
    return { kind: "covers", blockedPath: "/" };
  }

  for (const blocked of [...BLOCKED_HOST_PATHS, ...getBlockedHomePaths()]) {
    if (normalized === blocked || normalized.startsWith(blocked + "/")) {
      return { kind: "targets", blockedPath: blocked };
    }
  }

  return undefined;
}
