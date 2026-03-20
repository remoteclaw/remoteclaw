// Stubbed — the upstream ACP commands subsystem has been gutted in this fork.
// This provides the minimal export surface that commands-core.ts depends on.

/**
 * Resolves the bound ACP thread session key for a given command context.
 * Stubbed to always return undefined since the ACP subsystem is not available.
 */
export function resolveBoundAcpThreadSessionKey(_params: unknown): string | undefined {
  return undefined;
}
