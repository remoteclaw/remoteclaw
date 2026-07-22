import {
  hasConfiguredSecretInput,
  normalizeResolvedSecretInputString,
  normalizeSecretInputString,
} from "../../../src/plugin-sdk/secret-input-runtime.js";
import { buildSecretInputSchema } from "../../../src/plugin-sdk/secret-input-schema.js";

// Fork-native secret-input shim for the SMS channel.
//
// Peers re-export these symbols from their own `remoteclaw/plugin-sdk/<channel>`
// barrel (see extensions/mattermost/src/secret-input.ts). SMS has no per-channel
// barrel, and the underlying `secret-input-schema` / `secret-input-runtime`
// subpaths are not keys in root package.json "exports" (typecheck-only), so this
// shim sources them via direct `../../../src/...` relative imports — the fork's
// convention for un-barreled core internals.
export {
  buildSecretInputSchema,
  hasConfiguredSecretInput,
  normalizeResolvedSecretInputString,
  normalizeSecretInputString,
};
