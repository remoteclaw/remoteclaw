import { ErrorCodes, errorShape, formatValidationErrors } from "../protocol/index.js";
import type { RespondFn } from "./types.js";

// Ajv `ErrorObject`, derived from the exported `formatValidationErrors` contract
// (the src gateway protocol home validates via Ajv and exports no named error type).
type ValidationError = NonNullable<Parameters<typeof formatValidationErrors>[0]>[number];

/** Type guard function shape produced by gateway protocol validators. */
export type Validator<T> = ((params: unknown) => params is T) & {
  errors?: ValidationError[] | null;
};

/** Validate params and emit the standard INVALID_REQUEST response on failure. */
export function assertValidParams<T>(
  params: unknown,
  validate: Validator<T>,
  method: string,
  respond: RespondFn,
): params is T {
  if (validate(params)) {
    return true;
  }
  respond(
    false,
    undefined,
    errorShape(
      ErrorCodes.INVALID_REQUEST,
      `invalid ${method} params: ${formatValidationErrors(validate.errors)}`,
    ),
  );
  return false;
}
