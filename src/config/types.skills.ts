// Gutted in RemoteClaw fork (Middleware Boundary Principle)

export type SkillConfig = {
  enabled?: boolean;
  apiKey?: unknown;
  env?: Record<string, string>;
  config?: Record<string, unknown>;
};

export type SkillsLoadConfig = {
  extraDirs?: string[];
  watch?: boolean;
  watchDebounceMs?: number;
};

export type SkillsConfig = {
  load?: SkillsLoadConfig;
  list?: Record<string, SkillConfig>;
};
