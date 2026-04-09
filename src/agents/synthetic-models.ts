// Gutted in RemoteClaw fork (Middleware Boundary Principle)
export const SYNTHETIC_MODELS: Record<string, unknown>[] = [];
export const SYNTHETIC_MODEL_CATALOG: Record<string, unknown>[] = [];
export const SYNTHETIC_BASE_URL = "";
export const SYNTHETIC_DEFAULT_MODEL_REF = "";
export const buildSyntheticModelDefinition = (..._args: unknown[]) =>
  ({}) as Record<string, unknown>;
