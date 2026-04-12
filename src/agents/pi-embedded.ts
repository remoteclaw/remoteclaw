/* eslint-disable @typescript-eslint/no-explicit-any */
// Gutted in RemoteClaw fork (Middleware Boundary Principle)
export const abortEmbeddedPiRun = (..._args: unknown[]) => undefined as any;
export const runEmbeddedPiAgent = (..._args: unknown[]) => undefined as any;
export const queueEmbeddedPiMessage = (..._args: unknown[]) => undefined as any;
export const isEmbeddedPiRunActive = (..._args: unknown[]) => false;
export const isEmbeddedPiRunStreaming = (..._args: unknown[]) => false;
export const resolveEmbeddedSessionLane = (..._args: unknown[]) => "default" as string;
export const waitForEmbeddedPiRunEnd = async (..._args: unknown[]) => undefined as any;
