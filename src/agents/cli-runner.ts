// Gutted in RemoteClaw fork (Middleware Boundary Principle)
import type { AgentDeliveryResult } from "../middleware/types.js";
export type CliRunnerOptions = Record<string, unknown>;
export const createCliRunner = (..._args: unknown[]) => undefined as unknown;
export const runCliAgent = (..._args: unknown[]): Promise<AgentDeliveryResult> =>
  Promise.resolve({
    payloads: [],
    run: {} as AgentDeliveryResult["run"],
    mcp: {} as AgentDeliveryResult["mcp"],
    meta: {},
  });
