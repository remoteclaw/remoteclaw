/**
 * Runtime facade for subagent registry reads and steer updates.
 *
 * Announcement and control paths import this narrow surface so tests can mock
 * registry behavior without loading the full mutable registry module.
 */
export {
  countActiveDescendantRuns,
  countPendingDescendantRuns,
  countPendingDescendantRunsExcludingRun,
  isSubagentSessionRunActive,
  listSubagentRunsForRequester,
  replaceSubagentRunAfterSteer,
  resolveRequesterForChildSession,
  shouldIgnorePostCompletionAnnounceForSession,
} from "./subagent-registry.js";
