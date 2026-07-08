import { stringifyNonErrorCause } from "../../infra/errors.js";
import { redactSensitiveText } from "../../logging/redact.js";

export const ACP_ERROR_CODES = [
  "ACP_BACKEND_MISSING",
  "ACP_BACKEND_UNAVAILABLE",
  "ACP_BACKEND_UNSUPPORTED_CONTROL",
  "ACP_DISPATCH_DISABLED",
  "ACP_INVALID_RUNTIME_OPTION",
  "ACP_SESSION_INIT_FAILED",
  "ACP_TURN_FAILED",
] as const;

export type AcpRuntimeErrorCode = (typeof ACP_ERROR_CODES)[number];

export class AcpRuntimeError extends Error {
  readonly code: AcpRuntimeErrorCode;
  override readonly cause?: unknown;

  constructor(code: AcpRuntimeErrorCode, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "AcpRuntimeError";
    this.code = code;
    this.cause = options?.cause;
  }
}

export function isAcpRuntimeError(value: unknown): value is AcpRuntimeError {
  return value instanceof AcpRuntimeError;
}

export function toAcpRuntimeError(params: {
  error: unknown;
  fallbackCode: AcpRuntimeErrorCode;
  fallbackMessage: string;
}): AcpRuntimeError {
  if (params.error instanceof AcpRuntimeError) {
    return params.error;
  }
  if (params.error instanceof Error) {
    return new AcpRuntimeError(params.fallbackCode, params.error.message, {
      cause: params.error,
    });
  }
  return new AcpRuntimeError(params.fallbackCode, params.fallbackMessage, {
    cause: params.error,
  });
}

/**
 * Render an error and its `.cause` chain as a single human-readable line for
 * logs, lifecycle events, and tool results. Format is
 * `Name [code]: message <- Name [code]: message <- ...`. Number codes also
 * appear, so JSON-RPC error codes like `-32603` survive into surfaces that
 * downstream consumers see (gateway logs, telegram replies, tool_result text).
 *
 * Depth is capped to defend against self-referential `.cause` cycles.
 */
export function formatAcpErrorChain(error: unknown): string {
  if (!(error instanceof Error)) {
    return redactSensitiveText(String(error));
  }
  const segments: string[] = [renderSingleError(error)];
  let current: unknown = (error as unknown as { cause?: unknown }).cause;
  let depth = 0;
  while (current !== undefined && current !== null && depth < 8) {
    if (current instanceof Error) {
      segments.push(renderSingleError(current));
      current = (current as unknown as { cause?: unknown }).cause;
    } else {
      segments.push(stringifyNonErrorCause(current));
      current = undefined;
    }
    depth += 1;
  }
  return redactSensitiveText(segments.join(" <- "));
}

function renderSingleError(error: Error): string {
  const codeValue = (error as unknown as { code?: unknown }).code;
  const codeSuffix =
    typeof codeValue === "string" || typeof codeValue === "number" ? ` [${codeValue}]` : "";
  return `${error.name}${codeSuffix}: ${error.message}`;
}

export async function withAcpRuntimeErrorBoundary<T>(params: {
  run: () => Promise<T>;
  fallbackCode: AcpRuntimeErrorCode;
  fallbackMessage: string;
}): Promise<T> {
  try {
    return await params.run();
  } catch (error) {
    throw toAcpRuntimeError({
      error,
      fallbackCode: params.fallbackCode,
      fallbackMessage: params.fallbackMessage,
    });
  }
}
