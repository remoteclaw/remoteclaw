/** Stub — browser client actions (upstream feature, not available in fork). */
export type BrowserClientAction = Record<string, unknown>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- stub return type, consumed by production code
export const browserAct = (..._args: unknown[]) => Promise.resolve(undefined as any);
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- stub return type, consumed by production code
export const browserConsoleMessages = (..._args: unknown[]) => Promise.resolve(undefined as any);
