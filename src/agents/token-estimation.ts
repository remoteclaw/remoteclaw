import type { AgentMessage } from "../types/pi-agent-core.js";

/**
 * Estimate the token count of a message.
 * Uses a simple chars/4 heuristic (conservative, overestimates).
 * Matches the behavior of pi-coding-agent's estimateTokens.
 */
export function estimateTokens(message: AgentMessage): number {
  let chars = 0;
  const msg = message as unknown as Record<string, unknown>;
  const role = msg.role as string;

  switch (role) {
    case "user": {
      const content = msg.content;
      if (typeof content === "string") {
        chars = content.length;
      } else if (Array.isArray(content)) {
        for (const block of content as Array<Record<string, unknown>>) {
          if (block.type === "text" && typeof block.text === "string") {
            chars += block.text.length;
          }
        }
      }
      return Math.ceil(chars / 4);
    }
    case "assistant": {
      const content = msg.content as Array<Record<string, unknown>>;
      for (const block of content) {
        if (block.type === "text" && typeof block.text === "string") {
          chars += block.text.length;
        } else if (block.type === "thinking" && typeof block.thinking === "string") {
          chars += block.thinking.length;
        } else if (block.type === "toolCall") {
          chars +=
            (typeof block.name === "string" ? block.name.length : 0) +
            JSON.stringify(block.arguments).length;
        }
      }
      return Math.ceil(chars / 4);
    }
    case "custom":
    case "toolResult": {
      const content = msg.content;
      if (typeof content === "string") {
        chars = content.length;
      } else if (Array.isArray(content)) {
        for (const block of content as Array<Record<string, unknown>>) {
          if (block.type === "text" && typeof block.text === "string") {
            chars += block.text.length;
          }
          if (block.type === "image") {
            chars += 4800;
          }
        }
      }
      return Math.ceil(chars / 4);
    }
    case "bashExecution": {
      chars =
        (typeof msg.command === "string" ? msg.command.length : 0) +
        (typeof msg.output === "string" ? msg.output.length : 0);
      return Math.ceil(chars / 4);
    }
    case "branchSummary":
    case "compactionSummary": {
      if (typeof msg.summary === "string") {
        chars = msg.summary.length;
      }
      return Math.ceil(chars / 4);
    }
  }
  return 0;
}
