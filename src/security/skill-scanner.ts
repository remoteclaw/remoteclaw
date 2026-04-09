// Gutted in RemoteClaw fork (Middleware Boundary Principle)
export type SkillScanResult = { safe: boolean; issues: string[] };
export type SkillScanFinding = {
  severity: "critical" | "warn" | "info";
  message: string;
  file: string;
  line: number;
};
export type SkillScanSummary = {
  safe: boolean;
  critical: number;
  warn: number;
  findings: SkillScanFinding[];
  fileCount: number;
};
export const scanSkillSecurity = (..._args: unknown[]): SkillScanResult => ({
  safe: true,
  issues: [],
});
export const scanDirectoryWithSummary = async (..._args: unknown[]): Promise<SkillScanSummary> => ({
  safe: true,
  critical: 0,
  warn: 0,
  findings: [],
  fileCount: 0,
});
