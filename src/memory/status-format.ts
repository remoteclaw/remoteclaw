// Gutted in RemoteClaw fork (Middleware Boundary Principle)
export const formatMemoryStatus = (..._args: unknown[]) => "" as string;
export type Tone = "ok" | "warn" | "fail" | "muted";
type StateResult = { state: string; tone: Tone };
type SummaryResult = { tone: Tone; text: string };
export const resolveMemoryCacheSummary = (..._args: unknown[]): SummaryResult => ({
  tone: "muted",
  text: "",
});
export const resolveMemoryFtsState = (..._args: unknown[]): StateResult => ({
  state: "disabled",
  tone: "muted",
});
export const resolveMemoryVectorState = (..._args: unknown[]): StateResult => ({
  state: "disabled",
  tone: "muted",
});
