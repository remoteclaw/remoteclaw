export type LegacyConfigRule = {
  path: string[];
  message: string;
  match?: (value: unknown, root: Record<string, unknown>) => boolean;
  // If true, only report when the legacy value is present in the original parsed
  // source (not only after include/env resolution).
  requireSourceLiteral?: boolean;
};

export type LegacyConfigMigration = {
  id: string;
  describe: string;
  apply: (raw: Record<string, unknown>, changes: string[]) => void;
};
