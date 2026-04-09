// Gutted in RemoteClaw fork (Middleware Boundary Principle)
export type SkillStatus = {
  loaded: boolean;
  count: number;
  workspaceDir?: string;
  skills?: Array<{ eligible: boolean; missing: Record<string, unknown[]> }>;
};

export function getSkillsStatus(..._args: unknown[]): SkillStatus {
  return { loaded: false, count: 0 };
}

export function buildWorkspaceSkillStatus(..._args: unknown[]): SkillStatus {
  return { loaded: false, count: 0, workspaceDir: "", skills: [] };
}
