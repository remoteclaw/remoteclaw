import { z } from "zod";
import { parseDurationMs } from "../cli/parse-duration.js";
import { AgentModelSchema } from "./zod-schema.agent-model.js";
import {
  GroupChatSchema,
  HumanDelaySchema,
  IdentitySchema,
  ToolsLinksSchema,
  ToolsMediaSchema,
} from "./zod-schema.core.js";

export const HeartbeatSchema = z
  .object({
    every: z.string().optional(),
    activeHours: z
      .object({
        start: z.string().optional(),
        end: z.string().optional(),
        timezone: z.string().optional(),
      })
      .strict()
      .optional(),
    model: z.string().optional(),
    session: z.string().optional(),
    includeReasoning: z.boolean().optional(),
    target: z.string().optional(),
    to: z.string().optional(),
    accountId: z.string().optional(),
    prompt: z.string().optional(),
    suppressToolErrorWarnings: z.boolean().optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (!val.every) {
      return;
    }
    try {
      parseDurationMs(val.every, { defaultUnit: "m" });
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["every"],
        message: "invalid duration (use ms, s, m, h)",
      });
    }

    const active = val.activeHours;
    if (!active) {
      return;
    }
    const timePattern = /^([01]\d|2[0-3]|24):([0-5]\d)$/;
    const validateTime = (raw: string | undefined, opts: { allow24: boolean }, path: string) => {
      if (!raw) {
        return;
      }
      if (!timePattern.test(raw)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["activeHours", path],
          message: 'invalid time (use "HH:MM" 24h format)',
        });
        return;
      }
      const [hourStr, minuteStr] = raw.split(":");
      const hour = Number(hourStr);
      const minute = Number(minuteStr);
      if (hour === 24 && minute !== 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["activeHours", path],
          message: "invalid time (24:00 is the only allowed 24:xx value)",
        });
        return;
      }
      if (hour === 24 && !opts.allow24) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["activeHours", path],
          message: "invalid time (start cannot be 24:00)",
        });
      }
    };

    validateTime(active.start, { allow24: false }, "start");
    validateTime(active.end, { allow24: true }, "end");
  })
  .optional();

const ToolPolicyBaseSchema = z
  .object({
    allow: z.array(z.string()).optional(),
    alsoAllow: z.array(z.string()).optional(),
    deny: z.array(z.string()).optional(),
  })
  .strict();

export const ToolPolicySchema = ToolPolicyBaseSchema.superRefine((value, ctx) => {
  if (value.allow && value.allow.length > 0 && value.alsoAllow && value.alsoAllow.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        "tools policy cannot set both allow and alsoAllow in the same scope (merge alsoAllow into allow, or remove allow and use profile + alsoAllow)",
    });
  }
}).optional();

export const ToolProfileSchema = z
  .union([z.literal("minimal"), z.literal("coding"), z.literal("messaging"), z.literal("full")])
  .optional();

type AllowlistPolicy = {
  allow?: string[];
  alsoAllow?: string[];
};

function addAllowAlsoAllowConflictIssue(
  value: AllowlistPolicy,
  ctx: z.RefinementCtx,
  message: string,
): void {
  if (value.allow && value.allow.length > 0 && value.alsoAllow && value.alsoAllow.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message,
    });
  }
}

export const ToolPolicyWithProfileSchema = z
  .object({
    allow: z.array(z.string()).optional(),
    alsoAllow: z.array(z.string()).optional(),
    deny: z.array(z.string()).optional(),
    profile: ToolProfileSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    addAllowAlsoAllowConflictIssue(
      value,
      ctx,
      "tools.byProvider policy cannot set both allow and alsoAllow in the same scope (merge alsoAllow into allow, or remove allow and use profile + alsoAllow)",
    );
  });

// Provider docking: allowlists keyed by provider id (no schema updates when adding providers).
export const ElevatedAllowFromSchema = z
  .record(z.string(), z.array(z.union([z.string(), z.number()])))
  .optional();

const ToolExecSafeBinProfileSchema = z
  .object({
    minPositional: z.number().int().nonnegative().optional(),
    maxPositional: z.number().int().nonnegative().optional(),
    allowedValueFlags: z.array(z.string()).optional(),
    deniedFlags: z.array(z.string()).optional(),
  })
  .strict();

const ToolExecBaseShape = {
  host: z.enum(["sandbox", "gateway", "node"]).optional(),
  security: z.enum(["deny", "allowlist", "full"]).optional(),
  ask: z.enum(["off", "on-miss", "always"]).optional(),
  node: z.string().optional(),
  pathPrepend: z.array(z.string()).optional(),
  safeBins: z.array(z.string()).optional(),
  safeBinTrustedDirs: z.array(z.string()).optional(),
  safeBinProfiles: z.record(z.string(), ToolExecSafeBinProfileSchema).optional(),
  backgroundMs: z.number().int().positive().optional(),
  timeoutSec: z.number().int().positive().optional(),
  cleanupMs: z.number().int().positive().optional(),
  notifyOnExit: z.boolean().optional(),
  notifyOnExitEmptySuccess: z.boolean().optional(),
} as const;

const AgentToolExecSchema = z
  .object({
    ...ToolExecBaseShape,
    approvalRunningNoticeMs: z.number().int().nonnegative().optional(),
  })
  .strict()
  .optional();

const ToolExecSchema = z.object(ToolExecBaseShape).strict().optional();

const ToolFsSchema = z
  .object({
    workspaceOnly: z.boolean().optional(),
  })
  .strict()
  .optional();

const CommonToolPolicyFields = {
  profile: ToolProfileSchema,
  allow: z.array(z.string()).optional(),
  alsoAllow: z.array(z.string()).optional(),
  deny: z.array(z.string()).optional(),
  byProvider: z.record(z.string(), ToolPolicyWithProfileSchema).optional(),
};

export const AgentToolsSchema = z
  .object({
    ...CommonToolPolicyFields,
    elevated: z
      .object({
        enabled: z.boolean().optional(),
        allowFrom: ElevatedAllowFromSchema,
      })
      .strict()
      .optional(),
    exec: AgentToolExecSchema,
    fs: ToolFsSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    addAllowAlsoAllowConflictIssue(
      value,
      ctx,
      "agent tools cannot set both allow and alsoAllow in the same scope (merge alsoAllow into allow, or remove allow and use profile + alsoAllow)",
    );
  })
  .optional();

export { AgentModelSchema };
export const AgentEntrySchema = z
  .object({
    id: z.string(),
    default: z.boolean().optional(),
    name: z.string().optional(),
    workspace: z.string().optional(),
    agentDir: z.string().optional(),
    model: AgentModelSchema.optional(),
    skills: z.array(z.string()).optional(),
    humanDelay: HumanDelaySchema.optional(),
    heartbeat: HeartbeatSchema,
    identity: IdentitySchema,
    groupChat: GroupChatSchema,
    subagents: z
      .object({
        allowAgents: z.array(z.string()).optional(),
        model: z
          .union([
            z.string(),
            z
              .object({
                primary: z.string().optional(),
                fallbacks: z.array(z.string()).optional(),
              })
              .strict(),
          ])
          .optional(),
        thinking: z.string().optional(),
      })
      .strict()
      .optional(),
    tools: AgentToolsSchema,
  })
  .strict();

export const ToolsSchema = z
  .object({
    ...CommonToolPolicyFields,
    media: ToolsMediaSchema,
    links: ToolsLinksSchema,
    sessions: z
      .object({
        visibility: z.enum(["self", "tree", "agent", "all"]).optional(),
      })
      .strict()
      .optional(),
    message: z
      .object({
        allowCrossContextSend: z.boolean().optional(),
        crossContext: z
          .object({
            allowWithinProvider: z.boolean().optional(),
            allowAcrossProviders: z.boolean().optional(),
            marker: z
              .object({
                enabled: z.boolean().optional(),
                prefix: z.string().optional(),
                suffix: z.string().optional(),
              })
              .strict()
              .optional(),
          })
          .strict()
          .optional(),
        broadcast: z
          .object({
            enabled: z.boolean().optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
    agentToAgent: z
      .object({
        enabled: z.boolean().optional(),
        allow: z.array(z.string()).optional(),
      })
      .strict()
      .optional(),
    elevated: z
      .object({
        enabled: z.boolean().optional(),
        allowFrom: ElevatedAllowFromSchema,
      })
      .strict()
      .optional(),
    exec: ToolExecSchema,
    fs: ToolFsSchema,
    subagents: z
      .object({
        tools: ToolPolicySchema,
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    addAllowAlsoAllowConflictIssue(
      value,
      ctx,
      "tools cannot set both allow and alsoAllow in the same scope (merge alsoAllow into allow, or remove allow and use profile + alsoAllow)",
    );
  })
  .optional();
