// Gutted in RemoteClaw fork (Middleware Boundary Principle)
// Minimal stub: preserves security audit detection of dangerous bind mounts.
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

function parseBindSourcePath(bind: string): string {
  const trimmed = bind.trim();
  const colonIdx = trimmed.indexOf(":");
  if (colonIdx < 0) {
    return trimmed;
  }
  return trimmed.slice(0, colonIdx);
}

function normalizeHostPath(raw: string): string {
  return path.posix.normalize(raw);
}

export function getBlockedBindReason(bind: string): BlockedBindReason | undefined {
  const sourceRaw = parseBindSourcePath(bind);
  if (!sourceRaw.startsWith("/")) {
    return { kind: "non_absolute", sourcePath: sourceRaw };
  }

  const normalized = normalizeHostPath(sourceRaw);

  if (normalized === "/") {
    return { kind: "covers", blockedPath: "/" };
  }

  for (const blocked of BLOCKED_HOST_PATHS) {
    if (normalized === blocked || normalized.startsWith(blocked + "/")) {
      return { kind: "targets", blockedPath: blocked };
    }
  }

  return undefined;
}
