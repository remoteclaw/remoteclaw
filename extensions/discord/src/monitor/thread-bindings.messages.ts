import { formatDurationCompact } from "../../../../src/infra/format-time/format-duration.js";

// Compact duration label for /session idle + max-age confirmations (e.g. "24h"). See #2932.
export const formatThreadBindingDurationLabel = (durationMs?: number | null): string =>
  formatDurationCompact(durationMs) ?? "";

// Gutted in RemoteClaw fork (Middleware Boundary Principle) — thread-bindings-messages removed
export const resolveThreadBindingFarewellText = (..._args: unknown[]) => "" as string;
export const resolveThreadBindingIntroText = (..._args: unknown[]) => "" as string;
export const resolveThreadBindingThreadName = (..._args: unknown[]) => "" as string;
