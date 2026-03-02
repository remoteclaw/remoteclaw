import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { McpHandlerContext } from "./context.js";
import { callMcpGateway } from "./session.js";

// ── TTS Tools ───────────────────────────────────────────────────────

/**
 * Registers text-to-speech MCP tools on the given server.
 *
 * Tools: tts_status, tts_convert, tts_providers,
 *        tts_set_provider, tts_enable, tts_disable.
 */
export function registerTtsTools(server: McpServer, ctx: McpHandlerContext): void {
  server.registerTool(
    "tts_status",
    {
      description: "Get current TTS status (enabled, provider, fallbacks).",
      inputSchema: z.object({}),
    },
    async () => {
      const result = await callMcpGateway(ctx, "tts.status", {});
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    "tts_convert",
    {
      description: "Convert text to speech audio.",
      inputSchema: z.object({
        text: z.string(),
        channel: z.string().optional(),
      }),
    },
    async (args) => {
      const result = await callMcpGateway(ctx, "tts.convert", {
        text: args.text,
        ...(args.channel !== undefined ? { channel: args.channel } : {}),
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    "tts_providers",
    {
      description: "List available TTS providers and their configuration.",
      inputSchema: z.object({}),
    },
    async () => {
      const result = await callMcpGateway(ctx, "tts.providers", {});
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    "tts_set_provider",
    {
      description: "Set the active TTS provider (openai, elevenlabs, or edge).",
      inputSchema: z.object({
        provider: z.string(),
      }),
    },
    async (args) => {
      const result = await callMcpGateway(ctx, "tts.setProvider", {
        provider: args.provider,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    "tts_enable",
    {
      description: "Enable text-to-speech.",
      inputSchema: z.object({}),
    },
    async () => {
      const result = await callMcpGateway(ctx, "tts.enable", {});
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    "tts_disable",
    {
      description: "Disable text-to-speech.",
      inputSchema: z.object({}),
    },
    async () => {
      const result = await callMcpGateway(ctx, "tts.disable", {});
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
}
