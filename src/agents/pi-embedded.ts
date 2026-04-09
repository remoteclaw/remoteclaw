// Gutted in RemoteClaw fork (Middleware Boundary Principle)
import type { AgentDeliveryResult } from "../middleware/types.js";
export const PI_EMBEDDED_RUNNER = undefined;
export const isPiEmbeddedAvailable = () => false;
export const runEmbeddedPiAgent = (..._args: unknown[]): Promise<AgentDeliveryResult> =>
  Promise.resolve({
    payloads: [],
    run: {} as AgentDeliveryResult["run"],
    mcp: {} as AgentDeliveryResult["mcp"],
    meta: {},
  });
export const abortEmbeddedPiRun = (..._args: unknown[]) => undefined as unknown;
export const waitForEmbeddedPiRunEnd = async (..._args: unknown[]) => undefined as unknown;
