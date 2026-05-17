export const REMOTECLAW_OWNER_ONLY_CORE_TOOL_NAMES = ["cron", "gateway", "nodes"] as const;

const REMOTECLAW_OWNER_ONLY_CORE_TOOL_NAME_SET: ReadonlySet<string> = new Set(
  REMOTECLAW_OWNER_ONLY_CORE_TOOL_NAMES,
);

export function isRemoteClawOwnerOnlyCoreToolName(toolName: string): boolean {
  return REMOTECLAW_OWNER_ONLY_CORE_TOOL_NAME_SET.has(toolName);
}
