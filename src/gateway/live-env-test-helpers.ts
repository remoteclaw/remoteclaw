const COMMON_LIVE_ENV_NAMES = [
  "REMOTECLAW_AGENT_RUNTIME",
  "REMOTECLAW_CONFIG_PATH",
  "REMOTECLAW_GATEWAY_TOKEN",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "REMOTECLAW_SKIP_BROWSER_CONTROL_SERVER",
  "REMOTECLAW_SKIP_CANVAS_HOST",
  "REMOTECLAW_SKIP_CHANNELS",
  "REMOTECLAW_SKIP_CRON",
  "REMOTECLAW_SKIP_GMAIL_WATCHER",
  "REMOTECLAW_STATE_DIR",
] as const;

export type LiveEnvSnapshot = Record<string, string | undefined>;

export function snapshotLiveEnv(extraNames: readonly string[] = []): LiveEnvSnapshot {
  const snapshot: LiveEnvSnapshot = {};
  for (const name of [...COMMON_LIVE_ENV_NAMES, ...extraNames]) {
    snapshot[name] = process.env[name];
  }
  return snapshot;
}

export function restoreLiveEnv(snapshot: LiveEnvSnapshot): void {
  for (const [name, value] of Object.entries(snapshot)) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
}
