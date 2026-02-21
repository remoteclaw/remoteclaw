import type { AgentEvent, AgentRuntimeParams } from "./types.js";

export interface AgentRuntime {
  readonly name: string;
  execute(params: AgentRuntimeParams): AsyncIterable<AgentEvent>;
}
