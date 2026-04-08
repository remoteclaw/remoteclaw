import { persistSessionUsageUpdate } from "./session-usage.js";

type PersistRunSessionUsageParams = Parameters<typeof persistSessionUsageUpdate>[0];

export async function persistRunSessionUsage(params: PersistRunSessionUsageParams): Promise<void> {
  await persistSessionUsageUpdate(params);
}

// Gutted in RemoteClaw fork — stub export for upstream compat
export function incrementRunCompactionCount(..._args: unknown[]): void {}
