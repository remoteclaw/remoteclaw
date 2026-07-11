import { ErrorCodes, errorShape, formatValidationErrors } from "../protocol/index.js";
import type { RespondFn } from "./types.js";

// Ajv `ErrorObject`, derived from the exported `formatValidationErrors` contract
// (the fork's protocol module no longer re-exports a `ValidationError` alias).
type ValidationError = NonNullable<Parameters<typeof formatValidationErrors>[0]>[number];

export type Validator<T> = ((params: unknown) => params is T) & {
  errors?: ValidationError[] | null;
};

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
