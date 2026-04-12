/* eslint-disable @typescript-eslint/no-explicit-any */
// Gutted in RemoteClaw fork (Middleware Boundary Principle)
// Minimal stub: preserves security audit detection of interpreter-like safe bins.

const INTERPRETER_LIKE_SAFE_BINS = new Set([
  "ash",
  "awk",
  "bash",
  "busybox",
  "bun",
  "cmd",
  "cmd.exe",
  "cscript",
  "dash",
  "deno",
  "fish",
  "gawk",
  "gsed",
  "ksh",
  "lua",
  "mawk",
  "nawk",
  "node",
  "nodejs",
  "perl",
  "php",
  "powershell",
  "powershell.exe",
  "pypy",
  "pwsh",
  "pwsh.exe",
  "python",
  "python2",
  "python3",
  "ruby",
  "sed",
  "sh",
  "toybox",
  "wscript",
  "zsh",
]);

const INTERPRETER_LIKE_PATTERNS = [
  /^python\d+(?:\.\d+)?$/,
  /^ruby\d+(?:\.\d+)?$/,
  /^perl\d+(?:\.\d+)?$/,
  /^php\d+(?:\.\d+)?$/,
  /^node\d+(?:\.\d+)?$/,
];

function normalizeSafeBinName(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) {
    return "";
  }
  const tail = trimmed.split(/[\\/]/).at(-1);
  const normalized = tail ?? trimmed;
  return normalized.replace(/\.(?:exe|cmd|bat|com)$/i, "");
}

export function isInterpreterLikeSafeBin(raw: string): boolean {
  const normalized = normalizeSafeBinName(raw);
  if (!normalized) {
    return false;
  }
  if (INTERPRETER_LIKE_SAFE_BINS.has(normalized)) {
    return true;
  }
  return INTERPRETER_LIKE_PATTERNS.some((pattern) => pattern.test(normalized));
}

export const listInterpreterLikeSafeBins = (entries: Iterable<string>): string[] =>
  Array.from(entries)
    .map((entry) => normalizeSafeBinName(entry))
    .filter((entry) => entry.length > 0 && isInterpreterLikeSafeBin(entry))
    .toSorted();
export const resolveMergedSafeBinProfileFixtures = (params: {
  global?: { safeBinProfiles?: Record<string, unknown> | null } | null;
  local?: { safeBinProfiles?: Record<string, unknown> | null } | null;
}): Record<string, unknown> | undefined => {
  const global = params.global?.safeBinProfiles ?? {};
  const local = params.local?.safeBinProfiles ?? {};
  const gKeys = Object.keys(global);
  const lKeys = Object.keys(local);
  if (gKeys.length === 0 && lKeys.length === 0) {
    return undefined;
  }
  return {
    ...global,
    ...local,
  };
};
