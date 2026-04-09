// Gutted in RemoteClaw fork (Middleware Boundary Principle)

export type AcpDispatchConfig = {
  enabled?: boolean;
};

export type AcpStreamConfig = {
  coalesceIdleMs?: number;
  maxChunkChars?: number;
  repeatSuppression?: boolean;
  deliveryMode?: "live" | "final_only";
  hiddenBoundarySeparator?: "none" | "space" | "newline" | "paragraph";
  maxOutputChars?: number;
};
