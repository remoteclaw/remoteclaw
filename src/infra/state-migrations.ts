import type { RemoteClawConfig } from "../config/config.js";
import type { SessionScope } from "../config/sessions/types.js";

export type LegacyStateDetection = {
  targetAgentId: string;
  targetMainKey: string;
  targetScope?: SessionScope;
  stateDir: string;
  oauthDir: string;
  sessions: {
    legacyDir: string;
    legacyStorePath: string;
    targetDir: string;
    targetStorePath: string;
    hasLegacy: boolean;
    legacyKeys: string[];
  };
  agentDir: {
    legacyDir: string;
    targetDir: string;
    hasLegacy: boolean;
  };
  whatsappAuth: {
    legacyDir: string;
    targetDir: string;
    hasLegacy: boolean;
  };
  pairingAllowFrom: {
    legacyTelegramPath: string;
    targetTelegramPath: string;
    hasLegacyTelegram: boolean;
  };
  preview: string[];
};

const EMPTY_RESULT = {
  migrated: false,
  skipped: false,
  changes: [] as string[],
  warnings: [] as string[],
};
const EMPTY_MIGRATION = { changes: [] as string[], warnings: [] as string[] };

const EMPTY_DETECTION: LegacyStateDetection = {
  targetAgentId: "",
  targetMainKey: "",
  stateDir: "",
  oauthDir: "",
  sessions: {
    legacyDir: "",
    legacyStorePath: "",
    targetDir: "",
    targetStorePath: "",
    hasLegacy: false,
    legacyKeys: [],
  },
  agentDir: { legacyDir: "", targetDir: "", hasLegacy: false },
  whatsappAuth: { legacyDir: "", targetDir: "", hasLegacy: false },
  pairingAllowFrom: { legacyTelegramPath: "", targetTelegramPath: "", hasLegacyTelegram: false },
  preview: [],
};

export function resetAutoMigrateLegacyStateForTest() {}

export function resetAutoMigrateLegacyAgentDirForTest() {}

export function resetAutoMigrateLegacyStateDirForTest() {}

export async function autoMigrateLegacyStateDir(_params: {
  env?: NodeJS.ProcessEnv;
  homedir?: () => string;
  log?: { info: (message: string) => void; warn: (message: string) => void };
}): Promise<{ migrated: boolean; skipped: boolean; changes: string[]; warnings: string[] }> {
  return { ...EMPTY_RESULT };
}

export async function detectLegacyStateMigrations(_params: {
  cfg: RemoteClawConfig;
  env?: NodeJS.ProcessEnv;
  homedir?: () => string;
}): Promise<LegacyStateDetection> {
  return { ...EMPTY_DETECTION };
}

export async function runLegacyStateMigrations(_params: {
  detected: LegacyStateDetection;
  now?: () => number;
}): Promise<{ changes: string[]; warnings: string[] }> {
  return { ...EMPTY_MIGRATION };
}

export async function migrateLegacyAgentDir(
  _detected: LegacyStateDetection,
  _now: () => number,
): Promise<{ changes: string[]; warnings: string[] }> {
  return { ...EMPTY_MIGRATION };
}

export async function autoMigrateLegacyAgentDir(_params: {
  cfg: RemoteClawConfig;
  env?: NodeJS.ProcessEnv;
  homedir?: () => string;
  log?: { info: (message: string) => void; warn: (message: string) => void };
  now?: () => number;
}): Promise<{ migrated: boolean; skipped: boolean; changes: string[]; warnings: string[] }> {
  return { ...EMPTY_RESULT };
}

export async function autoMigrateLegacyState(_params: {
  cfg: RemoteClawConfig;
  env?: NodeJS.ProcessEnv;
  homedir?: () => string;
  log?: { info: (message: string) => void; warn: (message: string) => void };
  now?: () => number;
}): Promise<{ migrated: boolean; skipped: boolean; changes: string[]; warnings: string[] }> {
  return { ...EMPTY_RESULT };
}
