import path from "node:path";
import { normalizeOptionalString } from "@remoteclaw/normalization-core/string-coerce";
import { resolveGatewayProfileSuffix } from "./constants.js";

const windowsAbsolutePath = /^[a-zA-Z]:[\\/]/;
const windowsUncPath = /^\\\\/;

export function resolveHomeDir(env: Record<string, string | undefined>): string {
  const home = env.HOME?.trim() || env.USERPROFILE?.trim();
  if (!home) {
    throw new Error("Missing HOME");
  }
  return home;
}

function resolveUserPathWithHome(input: string, home?: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return trimmed;
  }
  if (trimmed.startsWith("~")) {
    if (!home) {
      throw new Error("Missing HOME");
    }
    const expanded = trimmed.replace(/^~(?=$|[\\/])/, home);
    return path.resolve(expanded);
  }
  if (windowsAbsolutePath.test(trimmed) || windowsUncPath.test(trimmed)) {
    return trimmed;
  }
  return path.resolve(trimmed);
}

export function resolveGatewayStateDir(env: Record<string, string | undefined>): string {
  const override = env.REMOTECLAW_STATE_DIR?.trim();
  if (override) {
    const home = override.startsWith("~") ? resolveHomeDir(env) : undefined;
    return resolveUserPathWithHome(override, home);
  }
  const home = resolveHomeDir(env);
  const suffix = resolveGatewayProfileSuffix(env.REMOTECLAW_PROFILE);
  return path.join(home, `.remoteclaw${suffix}`);
}

export function resolveGatewayTaskScriptPath(env: Record<string, string | undefined>): string {
  const override = normalizeOptionalString(env.REMOTECLAW_TASK_SCRIPT);
  if (override) {
    return override;
  }
  const scriptName = normalizeOptionalString(env.REMOTECLAW_TASK_SCRIPT_NAME) || "gateway.cmd";
  if (/[/\\]|\.\./.test(scriptName)) {
    throw new Error(
      `REMOTECLAW_TASK_SCRIPT_NAME must be a file name only, not a path: ${scriptName}`,
    );
  }
  return path.join(resolveGatewayStateDir(env), scriptName);
}
