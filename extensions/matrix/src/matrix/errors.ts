import { normalizeLowercaseStringOrEmpty } from "remoteclaw/plugin-sdk/text-runtime";
import { formatErrorMessage } from "../../../../src/infra/errors.js";

export function formatMatrixErrorMessage(err: unknown): string {
  return formatErrorMessage(err);
}

export function formatMatrixErrorReason(err: unknown): string {
  return normalizeLowercaseStringOrEmpty(formatMatrixErrorMessage(err));
}

export function isMatrixNotFoundError(err: unknown): boolean {
  const errObj = err as { statusCode?: number; body?: { errcode?: string } };
  if (errObj?.statusCode === 404 || errObj?.body?.errcode === "M_NOT_FOUND") {
    return true;
  }
  const message = formatMatrixErrorReason(err);
  return (
    message.includes("m_not_found") || message.includes("[404]") || message.includes("not found")
  );
}
