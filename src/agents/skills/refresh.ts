// Gutted in RemoteClaw fork (Middleware Boundary Principle).
// Retained as no-op exports because session-updates.ts still references these.
export const ensureSkillsWatcher = (..._args: unknown[]) => {};
export const getSkillsSnapshotVersion = (..._args: unknown[]) => 0;
export const registerSkillsChangeListener =
  (..._args: unknown[]) =>
  () => {};
