import fs from "node:fs";
import type { ChannelLegacyStateMigrationPlan } from "remoteclaw/plugin-sdk/channel-contract";
import { resolveChannelAllowFromPath } from "remoteclaw/plugin-sdk/channel-pairing-paths";
import type { RemoteClawConfig } from "remoteclaw/plugin-sdk/config-runtime";
import { resolveDefaultTelegramAccountId } from "./account-selection.js";

function fileExists(pathValue: string): boolean {
  try {
    return fs.existsSync(pathValue) && fs.statSync(pathValue).isFile();
  } catch {
    return false;
  }
}

export function detectTelegramLegacyStateMigrations(params: {
  cfg: RemoteClawConfig;
  env: NodeJS.ProcessEnv;
}): ChannelLegacyStateMigrationPlan[] {
  const legacyPath = resolveChannelAllowFromPath("telegram", params.env);
  if (!fileExists(legacyPath)) {
    return [];
  }
  const accountId = resolveDefaultTelegramAccountId(params.cfg);
  const targetPath = resolveChannelAllowFromPath("telegram", params.env, accountId);
  if (fileExists(targetPath)) {
    return [];
  }
  return [
    {
      kind: "copy",
      label: "Telegram pairing allowFrom",
      sourcePath: legacyPath,
      targetPath,
    },
  ];
}
