import {
  AllowFromListSchema,
  buildCatchallMultiAccountChannelSchema,
  DmPolicySchema,
  GroupPolicySchema,
} from "remoteclaw/plugin-sdk/compat";
import { MarkdownConfigSchema } from "remoteclaw/plugin-sdk/zalo";
import { z } from "zod";

const zaloAccountSchema = z.object({
  name: z.string().optional(),
  enabled: z.boolean().optional(),
  markdown: MarkdownConfigSchema,
  botToken: z.string().optional(),
  tokenFile: z.string().optional(),
  webhookUrl: z.string().optional(),
  webhookSecret: z.string().optional(),
  webhookPath: z.string().optional(),
  dmPolicy: DmPolicySchema.optional(),
  allowFrom: AllowFromListSchema,
  groupPolicy: GroupPolicySchema.optional(),
  groupAllowFrom: AllowFromListSchema,
  mediaMaxMb: z.number().optional(),
  proxy: z.string().optional(),
  responsePrefix: z.string().optional(),
});

export const ZaloConfigSchema = buildCatchallMultiAccountChannelSchema(zaloAccountSchema);
