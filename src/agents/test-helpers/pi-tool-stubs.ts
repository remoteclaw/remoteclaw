import { Type } from "@sinclair/typebox";
import type { AgentTool, AgentToolResult } from "../agent-types.js";

export function createStubTool(name: string): AgentTool {
  return {
    name,
    label: name,
    description: "",
    parameters: Type.Object({}),
    execute: async () => ({}) as AgentToolResult,
  };
}
