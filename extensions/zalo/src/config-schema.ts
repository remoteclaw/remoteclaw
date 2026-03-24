import {
  AllowFromEntrySchema,
  buildCatchallMultiAccountChannelSchema,
  MarkdownConfigSchema,
} from "remoteclaw/plugin-sdk";
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
  dmPolicy: z.enum(["pairing", "allowlist", "open", "disabled"]).optional(),
  allowFrom: z.array(AllowFromEntrySchema).optional(),
  groupPolicy: z.enum(["disabled", "allowlist", "open"]).optional(),
  groupAllowFrom: z.array(AllowFromEntrySchema).optional(),
  mediaMaxMb: z.number().optional(),
  proxy: z.string().optional(),
  responsePrefix: z.string().optional(),
});

export const ZaloConfigSchema = buildCatchallMultiAccountChannelSchema(zaloAccountSchema);
