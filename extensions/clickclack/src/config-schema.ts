/**
 * Zod-backed config schema for ClickClack channel accounts.
 */
import { buildChannelConfigSchema, buildSecretInputSchema } from "remoteclaw/plugin-sdk/clickclack";
import { z } from "zod";

const ClickClackAccountConfigSchema = z
  .object({
    name: z.string().optional(),
    enabled: z.boolean().optional(),
    baseUrl: z.string().url().optional(),
    token: buildSecretInputSchema().optional(),
    workspace: z.string().optional(),
    botUserId: z.string().optional(),
    agentId: z.string().optional(),
    timeoutSeconds: z.number().int().min(1).max(3_600).optional(),
    defaultTo: z.string().optional(),
    allowFrom: z.array(z.string()).optional(),
    reconnectMs: z.number().int().min(100).max(60_000).optional(),
  })
  .strict();

const ClickClackConfigSchema = ClickClackAccountConfigSchema.extend({
  accounts: z.record(z.string(), ClickClackAccountConfigSchema.partial()).optional(),
  defaultAccount: z.string().optional(),
}).strict();

/**
 * Config schema exported to core so `remoteclaw doctor` and config validation
 * understand both default and named ClickClack accounts.
 */
export const clickClackConfigSchema = buildChannelConfigSchema(ClickClackConfigSchema);
