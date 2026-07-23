// Matrix plugin module implements client behavior.
export type { MatrixAuth } from "./client/types.js";
export { isBunRuntime } from "./client/runtime.js";
export {
  resolveMatrixConfig,
  resolveMatrixConfigForAccount,
  resolveMatrixAuth,
} from "./client/config.js";
export { createMatrixClient } from "./client/create-client.js";
export {
  resolveSharedMatrixClient,
  waitForMatrixSync,
  stopSharedClient,
  stopSharedClientForAccount,
} from "./client/shared.js";
