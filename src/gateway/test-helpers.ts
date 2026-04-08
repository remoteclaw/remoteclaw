export * from "./test-helpers.mocks.js";
export * from "./test-helpers.server.js";

// Gutted in RemoteClaw fork — stub export for upstream test compat
export const embeddedRunMock = {
  abortCalls: [] as string[],
  waitCalls: [] as string[],
  activeIds: new Set<string>(),
  waitResults: new Map<string, unknown>(),
};
