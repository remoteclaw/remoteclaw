export type FailoverReason =
  | "auth"
  | "format"
  | "rate_limit"
  | "billing"
  | "timeout"
  | "model_not_found"
  | "unknown";
