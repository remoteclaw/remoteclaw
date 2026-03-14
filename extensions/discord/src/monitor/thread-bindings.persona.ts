<<<<<<<< HEAD:extensions/discord/src/monitor/thread-bindings.persona.ts
import { SYSTEM_MARK } from "../../../../src/infra/system-message.js";
import type { ThreadBindingRecord } from "./thread-bindings.types.js";

const THREAD_BINDING_PERSONA_MAX_CHARS = 80;

function normalizePersonaLabel(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized || undefined;
}

export function resolveThreadBindingPersona(params: { label?: string; agentId?: string }): string {
  const base =
    normalizePersonaLabel(params.label) || normalizePersonaLabel(params.agentId) || "agent";
  return `${SYSTEM_MARK} ${base}`.slice(0, THREAD_BINDING_PERSONA_MAX_CHARS);
}

export function resolveThreadBindingPersonaFromRecord(record: ThreadBindingRecord): string {
  return resolveThreadBindingPersona({
    label: record.label,
    agentId: record.agentId,
  });
}
|||||||| parent of 5682ec37fa (refactor: move Discord channel implementation to extensions/ (#45660)):src/discord/monitor/thread-bindings.persona.ts
import { SYSTEM_MARK } from "../../infra/system-message.js";
import type { ThreadBindingRecord } from "./thread-bindings.types.js";

const THREAD_BINDING_PERSONA_MAX_CHARS = 80;

function normalizePersonaLabel(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized || undefined;
}

export function resolveThreadBindingPersona(params: { label?: string; agentId?: string }): string {
  const base =
    normalizePersonaLabel(params.label) || normalizePersonaLabel(params.agentId) || "agent";
  return `${SYSTEM_MARK} ${base}`.slice(0, THREAD_BINDING_PERSONA_MAX_CHARS);
}

export function resolveThreadBindingPersonaFromRecord(record: ThreadBindingRecord): string {
  return resolveThreadBindingPersona({
    label: record.label,
    agentId: record.agentId,
  });
}
========
export * from "../../../extensions/discord/src/monitor/thread-bindings.persona.js";
>>>>>>>> 5682ec37fa (refactor: move Discord channel implementation to extensions/ (#45660)):src/discord/monitor/thread-bindings.persona.ts
