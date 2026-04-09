// Stub — gutted in RemoteClaw fork (Middleware Boundary Principle)

export type SkillCommandEntry = Record<string, unknown> & { name: string };

export const resolveSkillCommands = (..._args: unknown[]) => [] as SkillCommandEntry[];
export const findMatchingSkillCommand = (..._args: unknown[]) =>
  undefined as SkillCommandEntry | undefined;
export const listSkillCommandsForAgents = (..._args: unknown[]) => [] as SkillCommandEntry[];
