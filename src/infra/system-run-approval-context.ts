/**
 * Parse a system.run.prepare response payload into a structured result.
 *
 * Minimal implementation retained for the nodes-cli `system.run` flow
 * which needs `cmdText` and `plan` from the prepare response.
 */
export function parsePreparedSystemRunPayload(
  payload: unknown,
): { cmdText: string; plan: Record<string, unknown> } | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const raw = payload as Record<string, unknown>;
  const cmdText = typeof raw.cmdText === "string" ? raw.cmdText : undefined;
  const plan =
    raw.plan && typeof raw.plan === "object" && !Array.isArray(raw.plan)
      ? (raw.plan as Record<string, unknown>)
      : undefined;
  if (!cmdText || !plan) {
    return null;
  }
  return { cmdText, plan };
}
