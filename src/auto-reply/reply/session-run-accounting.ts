import { persistSessionUsageUpdate } from "./session-usage.js";

type PersistRunSessionUsageParams = Parameters<typeof persistSessionUsageUpdate>[0];

export async function persistRunSessionUsage(params: PersistRunSessionUsageParams): Promise<void> {
  await persistSessionUsageUpdate(params);
}
