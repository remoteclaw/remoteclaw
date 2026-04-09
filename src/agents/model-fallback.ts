// Gutted in RemoteClaw fork (Middleware Boundary Principle)
// Model fallback is not used — CLI agents manage their own models.
import type { AgentDeliveryResult } from "../middleware/types.js";

export type ModelFallbackResult = {
  result: AgentDeliveryResult;
  provider?: string;
  model?: string;
};

export async function runWithModelFallback(..._args: unknown[]): Promise<ModelFallbackResult> {
  return {
    result: {
      payloads: [],
      run: {} as AgentDeliveryResult["run"],
      mcp: {} as AgentDeliveryResult["mcp"],
      meta: {},
    },
  };
}
