// Re-export from src/ for cherry-pick compatibility
export {
  normalizeAllowFrom,
  normalizeAllowFromWithStore,
  isSenderAllowed,
  firstDefined,
  resolveSenderAllowMatch,
} from "../../../src/telegram/bot-access.js";
export type { NormalizedAllowFrom, AllowFromMatch } from "../../../src/telegram/bot-access.js";
