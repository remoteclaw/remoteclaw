import { z } from "zod";
import { getBlockedNetworkModeReason } from "../agents/sandbox/network-mode.js";
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
    directPolicy: z.union([z.literal("allow"), z.literal("block")]).optional(),
    to: z.string().optional(),
    accountId: z.string().optional(),
    prompt: z.string().optional(),
    ackMaxChars: z.number().int().nonnegative().optional(),
    suppressToolErrorWarnings: z.boolean().optional(),
    lightContext: z.boolean().optional(),
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

export const SandboxDockerSchema = z
  .object({
    image: z.string().optional(),
    containerPrefix: z.string().optional(),
    workdir: z.string().optional(),
    readOnlyRoot: z.boolean().optional(),
    tmpfs: z.array(z.string()).optional(),
    network: z.string().optional(),
    user: z.string().optional(),
    capDrop: z.array(z.string()).optional(),
    env: z.record(z.string(), z.string()).optional(),
    setupCommand: z
      .union([z.string(), z.array(z.string())])
      .transform((value) => (Array.isArray(value) ? value.join("\n") : value))
      .optional(),
    pidsLimit: z.number().int().positive().optional(),
    memory: z.union([z.string(), z.number()]).optional(),
    memorySwap: z.union([z.string(), z.number()]).optional(),
    cpus: z.number().positive().optional(),
    ulimits: z
      .record(
        z.string(),
        z.union([
          z.string(),
          z.number(),
          z
            .object({
              soft: z.number().int().nonnegative().optional(),
              hard: z.number().int().nonnegative().optional(),
            })
            .strict(),
        ]),
      )
      .optional(),
    seccompProfile: z.string().optional(),
    apparmorProfile: z.string().optional(),
    dns: z.array(z.string()).optional(),
    extraHosts: z.array(z.string()).optional(),
    binds: z.array(z.string()).optional(),
    dangerouslyAllowReservedContainerTargets: z.boolean().optional(),
    dangerouslyAllowExternalBindSources: z.boolean().optional(),
    dangerouslyAllowContainerNamespaceJoin: z.boolean().optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.binds) {
      for (let i = 0; i < data.binds.length; i += 1) {
        const bind = data.binds[i]?.trim() ?? "";
        if (!bind) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["binds", i],
            message: "Sandbox security: bind mount entry must be a non-empty string.",
          });
          continue;
        }
        const firstColon = bind.indexOf(":");
        const source = (firstColon <= 0 ? bind : bind.slice(0, firstColon)).trim();
        if (!source.startsWith("/")) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["binds", i],
            message:
              `Sandbox security: bind mount "${bind}" uses a non-absolute source path "${source}". ` +
              "Only absolute POSIX paths are supported for sandbox binds.",
          });
        }
      }
    }
    const blockedNetworkReason = getBlockedNetworkModeReason({
      network: data.network,
      allowContainerNamespaceJoin: data.dangerouslyAllowContainerNamespaceJoin === true,
    });
    if (blockedNetworkReason === "host") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["network"],
        message:
          'Sandbox security: network mode "host" is blocked. Use "bridge" or "none" instead.',
      });
    }
    if (blockedNetworkReason === "container_namespace_join") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["network"],
        message:
          'Sandbox security: network mode "container:*" is blocked by default. ' +
          "Use a custom bridge network, or set dangerouslyAllowContainerNamespaceJoin=true only when you fully trust this runtime.",
      });
    }
    if (data.seccompProfile?.trim().toLowerCase() === "unconfined") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["seccompProfile"],
        message:
          'Sandbox security: seccomp profile "unconfined" is blocked. ' +
          "Use a custom seccomp profile file or omit this setting.",
      });
    }
    if (data.apparmorProfile?.trim().toLowerCase() === "unconfined") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["apparmorProfile"],
        message:
          'Sandbox security: apparmor profile "unconfined" is blocked. ' +
          "Use a named AppArmor profile or omit this setting.",
      });
    }
  })
  .optional();

export const SandboxBrowserSchema = z
  .object({
    enabled: z.boolean().optional(),
    image: z.string().optional(),
    containerPrefix: z.string().optional(),
    network: z.string().optional(),
    cdpPort: z.number().int().positive().optional(),
    cdpSourceRange: z.string().optional(),
    vncPort: z.number().int().positive().optional(),
    noVncPort: z.number().int().positive().optional(),
    headless: z.boolean().optional(),
    enableNoVnc: z.boolean().optional(),
    allowHostControl: z.boolean().optional(),
    autoStart: z.boolean().optional(),
    autoStartTimeoutMs: z.number().int().positive().optional(),
    binds: z.array(z.string()).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.network?.trim().toLowerCase() === "host") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["network"],
        message:
          'Sandbox security: browser network mode "host" is blocked. Use "bridge" or a custom bridge network instead.',
      });
    }
  })
  .strict()
  .optional();

export const SandboxPruneSchema = z
  .object({
    idleHours: z.number().int().nonnegative().optional(),
    maxAgeDays: z.number().int().nonnegative().optional(),
  })
  .strict()
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

const ToolExecApplyPatchSchema = z
  .object({
    enabled: z.boolean().optional(),
    workspaceOnly: z.boolean().optional(),
    allowModels: z.array(z.string()).optional(),
  })
  .strict()
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
  applyPatch: ToolExecApplyPatchSchema,
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

const ToolLoopDetectionDetectorSchema = z
  .object({
    genericRepeat: z.boolean().optional(),
    knownPollNoProgress: z.boolean().optional(),
    pingPong: z.boolean().optional(),
  })
  .strict()
  .optional();

const ToolLoopDetectionSchema = z
  .object({
    enabled: z.boolean().optional(),
    historySize: z.number().int().positive().optional(),
    warningThreshold: z.number().int().positive().optional(),
    criticalThreshold: z.number().int().positive().optional(),
    globalCircuitBreakerThreshold: z.number().int().positive().optional(),
    detectors: ToolLoopDetectionDetectorSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.warningThreshold !== undefined &&
      value.criticalThreshold !== undefined &&
      value.warningThreshold >= value.criticalThreshold
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["criticalThreshold"],
        message: "tools.loopDetection.warningThreshold must be lower than criticalThreshold.",
      });
    }
    if (
      value.criticalThreshold !== undefined &&
      value.globalCircuitBreakerThreshold !== undefined &&
      value.criticalThreshold >= value.globalCircuitBreakerThreshold
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["globalCircuitBreakerThreshold"],
        message:
          "tools.loopDetection.criticalThreshold must be lower than globalCircuitBreakerThreshold.",
      });
    }
  })
  .optional();

export const AgentSandboxSchema = z
  .object({
    mode: z.union([z.literal("off"), z.literal("non-main"), z.literal("all")]).optional(),
    workspaceAccess: z.union([z.literal("none"), z.literal("ro"), z.literal("rw")]).optional(),
    sessionToolsVisibility: z.union([z.literal("spawned"), z.literal("all")]).optional(),
    scope: z.union([z.literal("session"), z.literal("agent"), z.literal("shared")]).optional(),
    perSession: z.boolean().optional(),
    workspaceRoot: z.string().optional(),
    docker: SandboxDockerSchema,
    browser: SandboxBrowserSchema,
    prune: SandboxPruneSchema,
  })
  .strict()
  .superRefine((data, ctx) => {
    const blockedBrowserNetworkReason = getBlockedNetworkModeReason({
      network: data.browser?.network,
      allowContainerNamespaceJoin: data.docker?.dangerouslyAllowContainerNamespaceJoin === true,
    });
    if (blockedBrowserNetworkReason === "container_namespace_join") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["browser", "network"],
        message:
          'Sandbox security: browser network mode "container:*" is blocked by default. ' +
          "Set sandbox.docker.dangerouslyAllowContainerNamespaceJoin=true only when you fully trust this runtime.",
      });
    }
  })
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
    loopDetection: ToolLoopDetectionSchema,
    sandbox: z
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
      "agent tools cannot set both allow and alsoAllow in the same scope (merge alsoAllow into allow, or remove allow and use profile + alsoAllow)",
    );
  })
  .optional();

export { AgentModelSchema };

const AgentRuntimeAcpSchema = z
  .object({
    agent: z.string().optional(),
    backend: z.string().optional(),
    mode: z.enum(["persistent", "oneshot"]).optional(),
    cwd: z.string().optional(),
  })
  .strict()
  .optional();

const AgentRuntimeSchema = z
  .union([
    z
      .object({
        type: z.literal("embedded"),
      })
      .strict(),
    z
      .object({
        type: z.literal("acp"),
        acp: AgentRuntimeAcpSchema,
      })
      .strict(),
  ])
  .optional();

export const AgentEntrySchema = z
  .object({
    id: z.string(),
    default: z.boolean().optional(),
    name: z.string().optional(),
    workspace: z.string().trim().min(1, "agents.list[].workspace must be a non-empty string"),
    agentDir: z.string().optional(),
    model: AgentModelSchema.optional(),
    skills: z.array(z.string()).optional(),
    // Memory search config gutted — agents bring their own memory.
    // Stub kept for config parse compatibility (existing configs still parse).
    memorySearch: z.unknown().optional(),
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
    sandbox: AgentSandboxSchema,
    tools: AgentToolsSchema,
    runtime: z.union([AgentRuntimeSchema, z.enum(["claude", "gemini", "codex", "opencode"])]),
    // Fork-specific CLI runtime fields (RemoteClaw middleware bridge)
    auth: z.union([z.string(), z.array(z.string()), z.literal(false)]).optional(),
    runtimeArgs: z.array(z.string()).optional(),
    runtimeEnv: z.record(z.string(), z.string()).optional(),
  })
  .strict();

export const ToolsSchema = z
  .object({
    ...CommonToolPolicyFields,
    // Web search/fetch tool config gutted — agents bring their own web tools.
    // Stub kept for config parse compatibility (existing configs still parse).
    web: z.unknown().optional(),
    media: ToolsMediaSchema,
    links: ToolsLinksSchema,
    sessions: z
      .object({
        visibility: z.enum(["self", "tree", "agent", "all"]).optional(),
      })
      .strict()
      .optional(),
    loopDetection: ToolLoopDetectionSchema,
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
    sandbox: z
      .object({
        tools: ToolPolicySchema,
      })
      .strict()
      .optional(),
    sessions_spawn: z
      .object({
        attachments: z
          .object({
            enabled: z.boolean().optional(),
            maxTotalBytes: z.number().optional(),
            maxFiles: z.number().optional(),
            maxFileBytes: z.number().optional(),
            retainOnSessionKeep: z.boolean().optional(),
          })
          .strict()
          .optional(),
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
