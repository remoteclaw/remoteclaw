import { resolveFreshSessionTotalTokens } from "../../config/sessions.js";
import { logVerbose } from "../../globals.js";
import { enqueueSystemEvent } from "../../infra/system-events.js";
import { formatContextUsageShort } from "../status.js";
import type { CommandHandler } from "./commands-types.js";

export const handleCompactCommand: CommandHandler = async (params) => {
  const compactRequested =
    params.command.commandBodyNormalized === "/compact" ||
    params.command.commandBodyNormalized.startsWith("/compact ");
  if (!compactRequested) {
    return null;
  }
  if (!params.command.isAuthorizedSender) {
    logVerbose(
      `Ignoring /compact from unauthorized sender: ${params.command.senderId || "<unknown>"}`,
    );
    return { shouldContinue: false };
  }
  if (!params.sessionEntry?.sessionId) {
    return {
      shouldContinue: false,
      reply: { text: "Compaction unavailable (missing session id)." },
    };
  }
  // Embedded engine removed (#74); compaction is unavailable.
  const compactLabel = "Compaction unavailable";
  const reason = "Embedded engine removed; compaction not yet re-implemented.";
  const totalTokens = resolveFreshSessionTotalTokens(params.sessionEntry);
  const contextSummary = formatContextUsageShort(
    typeof totalTokens === "number" && totalTokens > 0 ? totalTokens : null,
    params.contextTokens ?? params.sessionEntry.contextTokens ?? null,
  );
  const line = `${compactLabel}: ${reason} \u2022 ${contextSummary}`;
  enqueueSystemEvent(line, { sessionKey: params.sessionKey });
  return { shouldContinue: false, reply: { text: `\u2699\uFE0F ${line}` } };
};
