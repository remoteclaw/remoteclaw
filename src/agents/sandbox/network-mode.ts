// Gutted in RemoteClaw fork (Middleware Boundary Principle)
export type NetworkMode = "bridge" | "none" | "host";
export const DEFAULT_NETWORK_MODE: NetworkMode = "bridge";
export const getBlockedNetworkModeReason = (..._args: unknown[]) => undefined as string | undefined;
