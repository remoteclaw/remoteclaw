import { listSkillCommandsForAgents as listSkillCommandsForAgentsImpl } from "remoteclaw/plugin-sdk/reply-runtime";

type ListSkillCommandsForAgents =
  typeof import("remoteclaw/plugin-sdk/reply-runtime").listSkillCommandsForAgents;

export function listSkillCommandsForAgents(
  ...args: Parameters<ListSkillCommandsForAgents>
): ReturnType<ListSkillCommandsForAgents> {
  return listSkillCommandsForAgentsImpl(...args);
}
