export type LegacyConfigRule = {
  path: string[];
  message: string;
  match?: (value: unknown, root: Record<string, unknown>) => boolean;
};

export type LegacyConfigMigration = {
  id: string;
  describe: string;
  apply: (raw: Record<string, unknown>, changes: string[]) => void;
};
