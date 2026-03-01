import type { ContextFile } from "../../agents/agent-helpers.js";
import { resolveBootstrapContextForRun } from "../../agents/bootstrap-files.js";
import { createOpenClawCodingTools } from "../../agents/pi-tools.js";
import type { AgentTool } from "../../types/pi-compat.js";
// Sandbox infrastructure removed (#68)
const resolveSandboxRuntimeStatus = (_opts: Record<string, unknown>) => ({
  sandboxed: false as const,
  mode: "off" as const,
  agentId: undefined as string | undefined,
});
import type { WorkspaceBootstrapFile } from "../../agents/workspace.js";
import { buildTtsSystemPromptHint } from "../../tts/tts.js";
import type { HandleCommandsParams } from "./commands-types.js";

export type CommandsSystemPromptBundle = {
  systemPrompt: string;
  tools: AgentTool[];
  skillsPrompt: string;
  bootstrapFiles: WorkspaceBootstrapFile[];
  injectedFiles: ContextFile[];
  sandboxRuntime: ReturnType<typeof resolveSandboxRuntimeStatus>;
};

export async function resolveCommandsSystemPromptBundle(
  params: HandleCommandsParams,
): Promise<CommandsSystemPromptBundle> {
  const workspaceDir = params.workspaceDir;
  const { bootstrapFiles, contextFiles: injectedFiles } = await resolveBootstrapContextForRun({
    workspaceDir,
    config: params.cfg,
    sessionKey: params.sessionKey,
    sessionId: params.sessionEntry?.sessionId,
  });
  const skillsPrompt = "";
  const sandboxRuntime = resolveSandboxRuntimeStatus({
    cfg: params.cfg,
    sessionKey: params.ctx.SessionKey ?? params.sessionKey,
  });
  const tools = (() => {
    try {
      return createOpenClawCodingTools({
        config: params.cfg,
        agentId: params.agentId,
        workspaceDir,
        sessionKey: params.sessionKey,
        messageProvider: params.command.channel,
        groupId: params.sessionEntry?.groupId ?? undefined,
        groupChannel: params.sessionEntry?.groupChannel ?? undefined,
        groupSpace: params.sessionEntry?.space ?? undefined,
        spawnedBy: params.sessionEntry?.spawnedBy ?? undefined,
        senderIsOwner: params.command.senderIsOwner,
        modelProvider: params.provider,
        modelId: params.model,
      });
    } catch {
      return [];
    }
  })();
  // System prompt construction modules gutted in RemoteClaw — CLI agents build their own
  // system prompts. Return a minimal estimate for the /context command report.
  const ttsHint = params.cfg ? buildTtsSystemPromptHint(params.cfg) : undefined;
  const contextFileContent = injectedFiles
    .map((file) => `--- ${file.path ?? "file"} ---\n${file.content ?? ""}`)
    .join("\n\n");
  const systemPrompt = [
    `Workspace: ${workspaceDir}`,
    ttsHint ?? "",
    contextFileContent,
    skillsPrompt,
  ]
    .filter(Boolean)
    .join("\n\n");

  return { systemPrompt, tools, skillsPrompt, bootstrapFiles, injectedFiles, sandboxRuntime };
}
