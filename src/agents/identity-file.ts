/* eslint-disable @typescript-eslint/no-explicit-any */
// Gutted in RemoteClaw fork (Middleware Boundary Principle)
export type AgentIdentityFile = any;
export const identityHasValues = (..._args: unknown[]) => false;
export const loadAgentIdentityFromWorkspace = async (..._args: unknown[]) => null as unknown;
export const parseIdentityMarkdown = (..._args: unknown[]) => ({}) as AgentIdentityFile;
