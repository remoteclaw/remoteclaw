/**
 * Thin extraction module for approval plan building and execution path
 * hardening helpers.  Cherry-picked upstream tests expect these to live
 * in a dedicated module; the implementation remains in invoke-system-run.ts.
 */
export {
  buildSystemRunApprovalPlanV2 as buildSystemRunApprovalPlan,
  hardenApprovedExecutionPaths,
  revalidateApprovedMutableFileOperand,
} from "./invoke-system-run.js";
