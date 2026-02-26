import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { McpHandlerContext } from "./context.js";
import { callMcpGateway } from "./session.js";

// ── Message Tool Handlers ────────────────────────────────────────────────

/**
 * Registers channel messaging MCP tools on the given server.
 *
 * Each tool delegates to a `message:*` gateway method and, for tools that
 * send messages, records a side effect via {@link McpHandlerContext.sideEffects}.
 */
export function registerMessageTools(server: McpServer, ctx: McpHandlerContext): void {
  // ── message_send ─────────────────────────────────────────────────────

  server.registerTool(
    "message_send",
    {
      description: "Send a message to a target channel or user.",
      inputSchema: z.object({
        target: z.string(),
        message: z.string(),
        media: z.string().optional(),
      }),
    },
    async (args) => {
      const result = await callMcpGateway(ctx, "message:send", {
        target: args.target,
        message: args.message,
        media: args.media,
        channel: ctx.channel,
        accountId: ctx.accountId,
      });
      await ctx.sideEffects.recordMessageSent({
        tool: "message_send",
        provider: ctx.channel,
        accountId: ctx.accountId,
        to: args.target,
        text: args.message,
        mediaUrl: args.media,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // ── message_reply ────────────────────────────────────────────────────

  server.registerTool(
    "message_reply",
    {
      description: "Reply to a message in the current conversation.",
      inputSchema: z.object({
        message: z.string(),
        replyToId: z.string().optional(),
      }),
    },
    async (args) => {
      const result = await callMcpGateway(ctx, "message:reply", {
        message: args.message,
        replyToId: args.replyToId,
        channel: ctx.channel,
        accountId: ctx.accountId,
        to: ctx.to,
      });
      await ctx.sideEffects.recordMessageSent({
        tool: "message_reply",
        provider: ctx.channel,
        accountId: ctx.accountId,
        to: ctx.to,
        text: args.message,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // ── message_thread_reply ─────────────────────────────────────────────

  server.registerTool(
    "message_thread_reply",
    {
      description: "Reply to a message within a specific thread.",
      inputSchema: z.object({
        message: z.string(),
        threadId: z.string(),
      }),
    },
    async (args) => {
      const result = await callMcpGateway(ctx, "message:thread-reply", {
        message: args.message,
        threadId: args.threadId,
        channel: ctx.channel,
        accountId: ctx.accountId,
        to: ctx.to,
      });
      await ctx.sideEffects.recordMessageSent({
        tool: "message_thread_reply",
        provider: ctx.channel,
        accountId: ctx.accountId,
        to: ctx.to,
        text: args.message,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // ── message_broadcast ────────────────────────────────────────────────

  server.registerTool(
    "message_broadcast",
    {
      description: "Broadcast a message to multiple targets.",
      inputSchema: z.object({
        targets: z.array(z.string()),
        message: z.string(),
      }),
    },
    async (args) => {
      const result = await callMcpGateway(ctx, "message:broadcast", {
        targets: args.targets,
        message: args.message,
        channel: ctx.channel,
        accountId: ctx.accountId,
      });
      await ctx.sideEffects.recordMessageSent({
        tool: "message_broadcast",
        provider: ctx.channel,
        accountId: ctx.accountId,
        text: args.message,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // ── message_react ────────────────────────────────────────────────────

  server.registerTool(
    "message_react",
    {
      description: "React to a message with an emoji.",
      inputSchema: z.object({
        emoji: z.string(),
        messageId: z.string(),
      }),
    },
    async (args) => {
      const result = await callMcpGateway(ctx, "message:react", {
        emoji: args.emoji,
        messageId: args.messageId,
        channel: ctx.channel,
        accountId: ctx.accountId,
        to: ctx.to,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // ── message_delete ───────────────────────────────────────────────────

  server.registerTool(
    "message_delete",
    {
      description: "Delete a message.",
      inputSchema: z.object({
        messageId: z.string(),
      }),
    },
    async (args) => {
      const result = await callMcpGateway(ctx, "message:delete", {
        messageId: args.messageId,
        channel: ctx.channel,
        accountId: ctx.accountId,
        to: ctx.to,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // ── message_send_attachment ──────────────────────────────────────────

  server.registerTool(
    "message_send_attachment",
    {
      description: "Send a file attachment to a target.",
      inputSchema: z.object({
        target: z.string(),
        file: z.string(),
        caption: z.string().optional(),
      }),
    },
    async (args) => {
      const result = await callMcpGateway(ctx, "message:sendAttachment", {
        target: args.target,
        file: args.file,
        caption: args.caption,
        channel: ctx.channel,
        accountId: ctx.accountId,
      });
      await ctx.sideEffects.recordMessageSent({
        tool: "message_send_attachment",
        provider: ctx.channel,
        accountId: ctx.accountId,
        to: args.target,
        text: args.caption ?? "",
        mediaUrl: args.file,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // ── message_send_with_effect ─────────────────────────────────────────

  server.registerTool(
    "message_send_with_effect",
    {
      description: "Send a message with a visual effect.",
      inputSchema: z.object({
        target: z.string(),
        message: z.string(),
        effectId: z.string(),
      }),
    },
    async (args) => {
      const result = await callMcpGateway(ctx, "message:sendWithEffect", {
        target: args.target,
        message: args.message,
        effectId: args.effectId,
        channel: ctx.channel,
        accountId: ctx.accountId,
      });
      await ctx.sideEffects.recordMessageSent({
        tool: "message_send_with_effect",
        provider: ctx.channel,
        accountId: ctx.accountId,
        to: args.target,
        text: args.message,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // ── message_pin ──────────────────────────────────────────────────────

  server.registerTool(
    "message_pin",
    {
      description: "Pin a message in a channel.",
      inputSchema: z.object({
        messageId: z.string(),
      }),
    },
    async (args) => {
      const result = await callMcpGateway(ctx, "message:pin", {
        messageId: args.messageId,
        channel: ctx.channel,
        accountId: ctx.accountId,
        to: ctx.to,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // ── message_read ─────────────────────────────────────────────────────

  server.registerTool(
    "message_read",
    {
      description: "Read messages from a channel.",
      inputSchema: z.object({
        channelId: z.string().optional(),
        limit: z.number().optional(),
      }),
    },
    async (args) => {
      const result = await callMcpGateway(ctx, "message:readMessages", {
        channelId: args.channelId ?? ctx.to,
        limit: args.limit,
        channel: ctx.channel,
        accountId: ctx.accountId,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
}
