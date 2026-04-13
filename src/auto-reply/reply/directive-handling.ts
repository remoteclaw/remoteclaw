export { applyInlineDirectivesFastLane } from "./directive-handling.fast-lane.js";
export * from "./directive-handling.impl.js";
export type { InlineDirectives } from "./directive-handling.parse.js";
export { isDirectiveOnly, parseInlineDirectives } from "./directive-handling.parse.js";
export { persistInlineDirectives } from "./directive-handling.persist.js";
export { formatDirectiveAck } from "./directive-handling.shared.js";

// Gutted in RemoteClaw fork (Middleware Boundary Principle)
import type { ModelAliasIndex } from "../../agents/model-selection.js";

export const resolveDefaultModel = (
  ..._args: unknown[]
): {
  provider: string;
  model: string;
  aliasIndex: ModelAliasIndex;
  allowedModelKeys: Set<string>;
  allowedModelCatalog: { id: string; provider: string }[];
  resetModelOverride: boolean;
} => ({
  provider: "default",
  model: "default",
  aliasIndex: { byAlias: new Map(), byKey: new Map() },
  allowedModelKeys: new Set(),
  allowedModelCatalog: [],
  resetModelOverride: false,
});
