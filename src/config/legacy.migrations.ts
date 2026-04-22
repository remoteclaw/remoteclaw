import {
  ensureRecord,
  getAgentsList,
  getRecord,
  type LegacyConfigMigration,
} from "./legacy.shared.js";

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
  {
    id: "strip-agents-defaults-embedded-pi",
    describe: "Strip obsolete agents.defaults.embeddedPi field (#2479)",
    apply(raw, changes) {
      const agents = getRecord(raw.agents);
      const defaults = agents ? getRecord(agents.defaults) : null;
      if (!defaults || !Object.prototype.hasOwnProperty.call(defaults, "embeddedPi")) {
        return;
      }
      delete defaults.embeddedPi;
      changes.push(
        "Stripped obsolete agents.defaults.embeddedPi field — the Pi orchestrator was replaced by AgentRuntime.",
      );
    },
  },
  {
    id: "strip-thinking-level-fields",
    describe:
      "Strip obsolete thinkingDefault, subagents.thinking, and hooks.mappings[].thinking fields (#2480)",
    apply(raw, changes) {
      const agents = getRecord(raw.agents);
      const defaults = agents ? getRecord(agents.defaults) : null;
      if (defaults) {
        if (Object.prototype.hasOwnProperty.call(defaults, "thinkingDefault")) {
          delete defaults.thinkingDefault;
          changes.push(
            "Stripped obsolete agents.defaults.thinkingDefault field — CLI runtimes own reasoning depth.",
          );
        }
        const defaultsSubagents = getRecord(defaults.subagents);
        if (
          defaultsSubagents &&
          Object.prototype.hasOwnProperty.call(defaultsSubagents, "thinking")
        ) {
          delete defaultsSubagents.thinking;
          changes.push(
            "Stripped obsolete agents.defaults.subagents.thinking field — CLI runtimes own reasoning depth.",
          );
        }
      }
      const agentsList = getAgentsList(agents);
      let strippedPerAgentSubagent = false;
      for (const entry of agentsList) {
        const entryRecord = getRecord(entry);
        if (!entryRecord) {
          continue;
        }
        const entrySubagents = getRecord(entryRecord.subagents);
        if (entrySubagents && Object.prototype.hasOwnProperty.call(entrySubagents, "thinking")) {
          delete entrySubagents.thinking;
          strippedPerAgentSubagent = true;
        }
      }
      if (strippedPerAgentSubagent) {
        changes.push(
          "Stripped obsolete agents.list[].subagents.thinking field(s) — CLI runtimes own reasoning depth.",
        );
      }
      const hooks = getRecord(raw.hooks);
      const mappings = Array.isArray(hooks?.mappings) ? hooks.mappings : [];
      let strippedHookMapping = false;
      for (const mapping of mappings) {
        const mappingRecord = getRecord(mapping);
        if (mappingRecord && Object.prototype.hasOwnProperty.call(mappingRecord, "thinking")) {
          delete mappingRecord.thinking;
          strippedHookMapping = true;
        }
      }
      if (strippedHookMapping) {
        changes.push(
          "Stripped obsolete hooks.mappings[].thinking field(s) — CLI runtimes own reasoning depth.",
        );
      }
      const gmail = getRecord(hooks?.gmail);
      if (gmail && Object.prototype.hasOwnProperty.call(gmail, "thinking")) {
        delete gmail.thinking;
        changes.push(
          "Stripped obsolete hooks.gmail.thinking field — CLI runtimes own reasoning depth.",
        );
      }
    },
  },
  {
    id: "telegram-require-mention",
    describe: "Move telegram.requireMention to channels.telegram.groups.*.requireMention",
    apply(raw, changes) {
      const telegram = getRecord(raw.telegram);
      if (telegram?.requireMention === undefined) {
        return;
      }
      const value = telegram.requireMention;
      delete telegram.requireMention;
      const channels = ensureRecord(raw, "channels");
      const channelTelegram = ensureRecord(channels, "telegram");
      const groups = ensureRecord(channelTelegram, "groups");
      const wildcard = ensureRecord(groups, "*");
      wildcard.requireMention = value;
      // Clean up empty telegram top-level key
      if (Object.keys(telegram).length === 0) {
        delete raw.telegram;
      }
      changes.push('Moved telegram.requireMention → channels.telegram.groups."*".requireMention.');
    },
  },
  {
    id: "tts-enabled-to-auto",
    describe: "Move messages.tts.enabled to messages.tts.auto",
    apply(raw, changes) {
      const messages = getRecord(raw.messages);
      const tts = messages ? getRecord(messages.tts) : null;
      if (!tts || tts.enabled === undefined) {
        return;
      }
      const enabled = tts.enabled;
      delete tts.enabled;
      tts.auto = enabled ? "always" : "never";
      changes.push("Moved messages.tts.enabled → messages.tts.auto (always).");
    },
  },
  {
    id: "agent-model-to-agents-defaults",
    describe: "Migrate legacy agent.model config to agents.defaults.model",
    apply(raw, changes) {
      const agent = getRecord(raw.agent);
      if (!agent) {
        return;
      }
      const model = typeof agent.model === "string" ? agent.model.trim() : undefined;
      const modelFallbacks = Array.isArray(agent.modelFallbacks) ? agent.modelFallbacks : undefined;
      const imageModel = typeof agent.imageModel === "string" ? agent.imageModel.trim() : undefined;
      const imageModelFallbacks = Array.isArray(agent.imageModelFallbacks)
        ? agent.imageModelFallbacks
        : undefined;
      const allowedModels = Array.isArray(agent.allowedModels) ? agent.allowedModels : undefined;
      const modelAliases = getRecord(agent.modelAliases);

      if (!model && !imageModel && !allowedModels && !modelAliases) {
        return;
      }

      const agents = ensureRecord(raw, "agents");
      const defaults = ensureRecord(agents, "defaults");

      if (model) {
        const modelObj: Record<string, unknown> = { primary: model };
        if (modelFallbacks && modelFallbacks.length > 0) {
          modelObj.fallbacks = modelFallbacks.filter(
            (f: unknown) => typeof f === "string" && f.trim(),
          );
        }
        defaults.model = modelObj;
      }

      if (imageModel) {
        const imageModelObj: Record<string, unknown> = { primary: imageModel };
        if (imageModelFallbacks && imageModelFallbacks.length > 0) {
          imageModelObj.fallbacks = imageModelFallbacks.filter(
            (f: unknown) => typeof f === "string" && f.trim(),
          );
        }
        defaults.imageModel = imageModelObj;
      }

      if (allowedModels || modelAliases) {
        const models: Record<string, unknown> = {};
        if (allowedModels) {
          for (const m of allowedModels) {
            if (typeof m === "string" && m.trim()) {
              models[m.trim()] = models[m.trim()] ?? {};
            }
          }
        }
        if (modelAliases) {
          for (const [alias, target] of Object.entries(modelAliases)) {
            if (typeof target === "string" && target.trim()) {
              const existing = getRecord(models[target.trim()]) ?? {};
              existing.alias = alias;
              models[target.trim()] = existing;
            }
          }
        }
        defaults.models = models;
      }

      delete raw.agent;
      changes.push("Migrated agent.model → agents.defaults.model.");
    },
  },
];
