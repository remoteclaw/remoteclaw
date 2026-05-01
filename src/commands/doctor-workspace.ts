import path from "node:path";
import { shortenHomePath } from "../utils.js";

export type LegacyWorkspaceDetection = {
  activeWorkspace: string;
  legacyDirs: string[];
};

export function detectLegacyWorkspaceDirs(params: {
  workspaceDir: string;
}): LegacyWorkspaceDetection {
  const activeWorkspace = path.resolve(params.workspaceDir);
  const legacyDirs: string[] = [];
  return { activeWorkspace, legacyDirs };
}

export function formatLegacyWorkspaceWarning(detection: LegacyWorkspaceDetection): string {
  return [
    "Extra workspace directories detected (may contain old agent files):",
    ...detection.legacyDirs.map((dir) => `- ${shortenHomePath(dir)}`),
    `Active workspace: ${shortenHomePath(detection.activeWorkspace)}`,
    "If unused, archive or move to Trash.",
  ].join("\n");
}
