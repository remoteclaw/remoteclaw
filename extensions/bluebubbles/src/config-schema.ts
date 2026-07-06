import { MarkdownConfigSchema, ToolPolicySchema } from "remoteclaw/plugin-sdk/bluebubbles";
import {
  AllowFromListSchema,
  buildCatchallMultiAccountChannelSchema,
  DmPolicySchema,
  GroupPolicySchema,
} from "remoteclaw/plugin-sdk/compat";
import { z } from "zod";
import { buildSecretInputSchema, hasConfiguredSecretInput } from "./secret-input.js";

const bluebubblesActionSchema = z
  .object({
    reactions: z.boolean().default(true),
    edit: z.boolean().default(true),
    unsend: z.boolean().default(true),
    reply: z.boolean().default(true),
    sendWithEffect: z.boolean().default(true),
    renameGroup: z.boolean().default(true),
    setGroupIcon: z.boolean().default(true),
    addParticipant: z.boolean().default(true),
    removeParticipant: z.boolean().default(true),
    leaveGroup: z.boolean().default(true),
    sendAttachment: z.boolean().default(true),
  })
  .optional();

const bluebubblesGroupConfigSchema = z.object({
  requireMention: z.boolean().optional(),
  tools: ToolPolicySchema,
  /**
   * Free-form directive appended to the system prompt for every turn that
   * handles a message in this group. Use it for per-group persona tweaks or
   * behavioral rules (reply-threading, tapback conventions, etc.).
   */
  systemPrompt: z.string().optional(),
});

const bluebubblesAccountSchema = z
  .object({
    name: z.string().optional(),
    enabled: z.boolean().optional(),
    markdown: MarkdownConfigSchema,
    serverUrl: z.string().optional(),
    password: buildSecretInputSchema().optional(),
    webhookPath: z.string().optional(),
    dmPolicy: DmPolicySchema.optional(),
    allowFrom: AllowFromListSchema,
    groupAllowFrom: AllowFromListSchema,
    groupPolicy: GroupPolicySchema.optional(),
    historyLimit: z.number().int().min(0).optional(),
    dmHistoryLimit: z.number().int().min(0).optional(),
    textChunkLimit: z.number().int().positive().optional(),
    sendTimeoutMs: z.number().int().positive().optional(),
    chunkMode: z.enum(["length", "newline"]).optional(),
    mediaMaxMb: z.number().int().positive().optional(),
    mediaLocalRoots: z.array(z.string()).optional(),
    sendReadReceipts: z.boolean().optional(),
    allowPrivateNetwork: z.boolean().optional(),
    blockStreaming: z.boolean().optional(),
    /**
     * When an inbound reply lands without `replyToBody`/`replyToSender` and the
     * in-memory reply cache misses (e.g., multi-instance deployments sharing
     * one BlueBubbles account, after process restarts, or after long-lived
     * cache eviction), opt in to fetching the original message from the
     * BlueBubbles HTTP API as a best-effort fallback. Off by default.
     *
     * Left as `.optional()` rather than `.optional().default(false)` so that a
     * channel-level `channels.bluebubbles.replyContextApiFallback: true` still
     * propagates to accounts that omit the field. With a hard per-account
     * default, the merge would clobber the channel value with `false` and
     * operators would have to duplicate the flag under every `accounts.<id>`.
     * (PR #71820 review)
     */
    replyContextApiFallback: z.boolean().optional(),
    groups: z.object({}).catchall(bluebubblesGroupConfigSchema).optional(),
    coalesceSameSenderDms: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    const serverUrl = value.serverUrl?.trim() ?? "";
    const passwordConfigured = hasConfiguredSecretInput(value.password);
    if (serverUrl && !passwordConfigured) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["password"],
        message: "password is required when serverUrl is configured",
      });
    }
  });

export const BlueBubblesConfigSchema = buildCatchallMultiAccountChannelSchema(
  bluebubblesAccountSchema,
).extend({
  actions: bluebubblesActionSchema,
});
