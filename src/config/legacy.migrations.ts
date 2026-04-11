import { getAgentsList, getRecord, type LegacyConfigMigration } from "./legacy.shared.js";

export const LEGACY_CONFIG_MIGRATIONS: LegacyConfigMigration[] = [
  {
    id: "strip-agent-default-field",
    describe: "Strip deprecated agents.list[].default field (#1581)",
    apply(raw, changes) {
      const agents = getRecord(raw.agents);
      const list = getAgentsList(agents);
      let stripped = false;
      for (const entry of list) {
        if (getRecord(entry)?.default !== undefined) {
          delete (entry as Record<string, unknown>).default;
          stripped = true;
        }
      }
      if (stripped) {
        changes.push(
          "Stripped deprecated agents.list[].default field — sole-agent auto-selection replaces explicit defaults.",
        );
      }
    },
  },
];
