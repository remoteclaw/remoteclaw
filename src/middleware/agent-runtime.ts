import type { AgentEvent, AgentRuntimeParams } from "./types.js";

export interface AgentRuntime {
  readonly name: string;
  execute(params: AgentRuntimeParams): AsyncIterable<AgentEvent>;
}

type RuntimeFactory = () => AgentRuntime;

const registry = new Map<string, RuntimeFactory>();

export function registerRuntime(name: string, factory: RuntimeFactory): void {
  registry.set(name, factory);
}

export function getRuntime(name: string): AgentRuntime | undefined {
  const factory = registry.get(name);
  return factory?.();
}

export function getRuntimeNames(): string[] {
  return [...registry.keys()];
}

/** Clear registry — for testing only. */
export function clearRuntimeRegistry(): void {
  registry.clear();
}
