import { listSkillCommandsForAgents as listSkillCommandsForAgentsImpl } from "remoteclaw/plugin-sdk/command-auth";

type ListSkillCommandsForAgents =
  typeof import("remoteclaw/plugin-sdk/command-auth").listSkillCommandsForAgents;

export function listSkillCommandsForAgents(
  ...args: Parameters<ListSkillCommandsForAgents>
): ReturnType<ListSkillCommandsForAgents> {
  return listSkillCommandsForAgentsImpl(...args);
}
