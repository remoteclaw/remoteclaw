import { z } from "zod";
import { AgentDefaultsSchema } from "./zod-schema.agent-defaults.js";
import { AgentEntrySchema } from "./zod-schema.agent-runtime.js";
import { TranscribeAudioSchema } from "./zod-schema.core.js";

export const AgentsSchema = z
  .object({
    defaults: z.lazy(() => AgentDefaultsSchema).optional(),
    // PROTECTED (fork #2308): require .min(1) — empty agents.list must fail
    // at parse time. The v2026.4.5 sync attempted to revert this to optional
    // (upstream re-introduces the implicit-default-agent path that #2308
    // eliminated); restored here to keep the explicit-agent-config contract.
    list: z.array(AgentEntrySchema).min(1, "agents.list must contain at least one entry"),
  })
  .strict()
  .optional();

const BindingMatchSchema = z
  .object({
    channel: z.string(),
    accountId: z.string().optional(),
    peer: z
      .object({
        kind: z.union([
          z.literal("direct"),
          z.literal("group"),
          z.literal("channel"),
          /** @deprecated Use `direct` instead. Kept for backward compatibility. */
          z.literal("dm"),
        ]),
        id: z.string(),
      })
      .strict()
      .optional(),
    guildId: z.string().optional(),
    teamId: z.string().optional(),
    roles: z.array(z.string()).optional(),
  })
  .strict();

const RouteBindingSchema = z
  .object({
    type: z.literal("route").optional(),
    agentId: z.string(),
    comment: z.string().optional(),
    match: BindingMatchSchema,
  })
  .strict();

const AcpBindingSchema = z
  .object({
    type: z.literal("acp"),
    agentId: z.string(),
    comment: z.string().optional(),
    match: BindingMatchSchema,
    acp: z
      .object({
        mode: z.enum(["persistent", "oneshot"]).optional(),
        label: z.string().optional(),
        cwd: z.string().optional(),
        backend: z.string().optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    // PROTECTED (fork): ACP bindings cutover scope. The v2026.4.5 sync
    // dropped the channel-allowlist + Telegram canonical-topic checks
    // below; restored to keep the fork's #2308/#2317 contract that
    // `config.acp-binding-cutover.test.ts` exercises.
    const peerId = value.match.peer?.id?.trim() ?? "";
    if (!peerId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["match", "peer"],
        message: "ACP bindings require match.peer.id to target a concrete conversation.",
      });
      return;
    }
    const channel = value.match.channel.trim().toLowerCase();
    if (channel !== "discord" && channel !== "telegram") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["match", "channel"],
        message: 'ACP bindings currently support only "discord" and "telegram" channels.',
      });
      return;
    }
    if (channel === "telegram" && !/^-\d+:topic:\d+$/.test(peerId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["match", "peer", "id"],
        message:
          "Telegram ACP bindings require canonical topic IDs in the form -1001234567890:topic:42.",
      });
    }
  });

export const BindingsSchema = z.array(z.union([RouteBindingSchema, AcpBindingSchema])).optional();

export const BroadcastStrategySchema = z.enum(["parallel", "sequential"]);

export const BroadcastSchema = z
  .object({
    strategy: BroadcastStrategySchema.optional(),
  })
  .catchall(z.array(z.string()))
  .optional();

export const AudioSchema = z
  .object({
    transcription: TranscribeAudioSchema,
  })
  .strict()
  .optional();
