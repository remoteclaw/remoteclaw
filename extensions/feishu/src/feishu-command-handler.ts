// Gutted in RemoteClaw fork (Middleware Boundary Principle)
// PluginHookRunner and session types are not available in the fork.
type PluginHookRunner = Record<string, unknown>;

const DEFAULT_RESET_TRIGGERS = ["/new", "/reset"];

/**
 * Handle Feishu command messages and trigger appropriate hooks
 */
export async function handleFeishuCommand(
  messageText: string,
  sessionKey: string,
  hookRunner: PluginHookRunner,
  context: {
    cfg: unknown;
    sessionEntry: unknown;
    previousSessionEntry?: unknown;
    commandSource: string;
    timestamp: number;
  },
): Promise<boolean> {
  // Check if message is a reset command
  const trimmed = messageText.trim().toLowerCase();
  const isResetCommand = DEFAULT_RESET_TRIGGERS.some(
    (trigger: string) => trimmed === trigger || trimmed.startsWith(`${trigger} `),
  );

  if (isResetCommand) {
    // Extract the actual command (without arguments)
    const command = trimmed.split(" ")[0];

    // Trigger the before_reset hook
    const runner = hookRunner as { runBeforeReset?: (...args: unknown[]) => Promise<void> };
    if (runner.runBeforeReset) {
      await runner.runBeforeReset(
        {
          type: "command",
          action: command.replace("/", "") as "new" | "reset",
          context: {
            ...context,
            commandSource: "feishu",
          },
        },
        {
          agentId: "main",
          sessionKey,
        },
      );
    }

    return true; // Command was handled
  }

  return false; // Not a command we handle
}
