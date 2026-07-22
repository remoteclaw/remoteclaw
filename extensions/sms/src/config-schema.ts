import {
  AllowFromListSchema,
  buildChannelConfigSchema,
  DmPolicySchema,
  requireOpenAllowFrom,
} from "remoteclaw/plugin-sdk";
import { z } from "zod";
import { requireChannelOpenAllowFrom } from "../../shared/config-schema-helpers.js";
import { buildSecretInputSchema } from "./secret-input.js";

const SecretInputSchema = buildSecretInputSchema();

// Base account shape, kept identical to upstream. The `.strict().superRefine`
// pair is split into an unrefined base (so it can be `.extend`ed) plus a refined
// wrapper, mirroring the live peer extensions/mattermost/src/config-schema.ts —
// the fork's Zod rejects `.extend` on an already-refined schema.
const SmsAccountConfigSchemaBase = z
  .object({
    name: z.string().optional(),
    enabled: z.boolean().optional(),
    accountSid: z.string().optional(),
    authToken: SecretInputSchema.optional(),
    fromNumber: z.string().optional(),
    messagingServiceSid: z.string().optional(),
    defaultTo: z.string().optional(),
    webhookPath: z.string().optional(),
    publicWebhookUrl: z.string().optional(),
    dangerouslyDisableSignatureValidation: z.boolean().optional(),
    dmPolicy: DmPolicySchema.optional().default("pairing"),
    allowFrom: AllowFromListSchema,
    textChunkLimit: z.number().int().positive().optional(),
  })
  .strict();

const SmsAccountConfigSchema = SmsAccountConfigSchemaBase.superRefine((value, ctx) => {
  requireChannelOpenAllowFrom({
    channel: "sms",
    policy: value.dmPolicy,
    allowFrom: value.allowFrom,
    ctx,
    requireOpenAllowFrom,
  });
});

export const SmsConfigSchema = SmsAccountConfigSchemaBase.extend({
  accounts: z.record(z.string(), SmsAccountConfigSchema.optional()).optional(),
  defaultAccount: z.string().optional(),
}).superRefine((value, ctx) => {
  requireChannelOpenAllowFrom({
    channel: "sms",
    policy: value.dmPolicy,
    allowFrom: value.allowFrom,
    ctx,
    requireOpenAllowFrom,
  });
});

// The fork's `buildChannelConfigSchema` takes only the schema — upstream's second
// `{ uiHints }` argument (config-editor labels) is not part of the fork's kept
// primitive (consumer-onboarding UX was gutted), so the uiHints block is dropped.
export const SmsChannelConfigSchema = buildChannelConfigSchema(SmsConfigSchema);
