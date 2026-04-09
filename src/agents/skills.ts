// Gutted in RemoteClaw fork (Middleware Boundary Principle)
import type { SessionSkillSnapshot } from "../config/sessions/types.js";
export type SkillsSnapshot = Record<string, unknown>;
export const loadSkills = (..._args: unknown[]) => ({}) as Record<string, unknown>;
export const buildWorkspaceSkillSnapshot = (..._args: unknown[]): SessionSkillSnapshot =>
  ({ prompt: "", skills: [] }) as SessionSkillSnapshot;
