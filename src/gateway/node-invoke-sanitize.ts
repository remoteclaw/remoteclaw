import type { GatewayClient } from "./server-methods/types.js";

export function sanitizeNodeInvokeParamsForForwarding(opts: {
  nodeId: string;
  command: string;
  rawParams: unknown;
  client: GatewayClient | null;
}):
  | { ok: true; params: unknown }
  | { ok: false; message: string; details?: Record<string, unknown> } {
  return { ok: true, params: opts.rawParams };
}
