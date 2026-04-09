// Gutted in RemoteClaw fork (Middleware Boundary Principle)
export type FormField = Record<string, unknown>;
export const extractFormFields = (..._args: unknown[]) => [] as FormField[];

export const normalizeBrowserFormField = (
  field: Record<string, unknown>,
): Record<string, unknown> | null => {
  const ref = typeof field.ref === "string" ? field.ref.trim() : "";
  if (!ref) {
    return null;
  }
  const type = typeof field.type === "string" ? field.type.trim() || undefined : undefined;
  return { ref, type, value: field.value };
};
export const normalizeBrowserFormFieldValue = (value: unknown): string | undefined =>
  typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? String(value)
    : undefined;
