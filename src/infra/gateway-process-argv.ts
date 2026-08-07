// Parses gateway process command lines for process discovery.
import { normalizeLowercaseStringOrEmpty } from "@remoteclaw/normalization-core/string-coerce";
import { normalizeStringEntries } from "@remoteclaw/normalization-core/string-normalization";

function normalizeProcArg(arg: string): string {
  return normalizeLowercaseStringOrEmpty(arg.replaceAll("\\", "/"));
}

export function parseProcCmdline(raw: string): string[] {
  return normalizeStringEntries(raw.split("\0"));
}

export function isGatewayArgv(args: string[], opts?: { allowGatewayBinary?: boolean }): boolean {
  const normalized = args.map(normalizeProcArg);
  const exe = (normalized[0] ?? "").replace(/\.(bat|cmd|exe)$/i, "");
  const isGatewayBinary = exe.endsWith("/remoteclaw-gateway") || exe === "remoteclaw-gateway";
  if (!normalized.includes("gateway")) {
    return opts?.allowGatewayBinary === true && isGatewayBinary;
  }

  const entryCandidates = [
    "dist/index.js",
    "dist/entry.js",
    "remoteclaw.mjs",
    "scripts/run-node.mjs",
    "src/entry.ts",
    "src/index.ts",
  ];
  if (normalized.some((arg) => entryCandidates.some((entry) => arg.endsWith(entry)))) {
    return true;
  }

  return (
    exe.endsWith("/remoteclaw") ||
    exe === "remoteclaw" ||
    (opts?.allowGatewayBinary === true && isGatewayBinary)
  );
}
