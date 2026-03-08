/**
 * Auth key retry — rotates to the next auth profile on rate-limit / auth errors.
 *
 * When an agent has multiple auth profiles configured (`auth: ["k1", "k2"]`),
 * a rate-limit or auth failure triggers a retry with the next key in the
 * rotation. Each key is tried at most once per invocation.
 */

import { resolveAuthEnv, resolveAuthProfileCount } from "../auth/env-injection.js";
import type { AuthProfileStore } from "../auth/types.js";
import type { RemoteClawConfig } from "../config/config.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { isAuthRotatableError } from "./error-classifier.js";

const log = createSubsystemLogger("auth-retry");

export type AuthKeyRetryOptions = {
  cfg: RemoteClawConfig;
  agentId: string;
  agentDir?: string;
  baseEnv?: Record<string, string>;
  store?: AuthProfileStore;
};

/**
 * Execute a callback with automatic auth key retry on rate-limit / auth errors.
 *
 * - `auth: false` / `undefined` / single key → one attempt, no retry.
 * - `auth: ["k1", "k2", ...]` → up to `N` attempts (one per key).
 *
 * The `execute` callback receives a merged env (base + auth). On a rate-limit
 * or auth error (thrown or returned in the result), the next profile is
 * selected via round-robin and the callback is retried.
 *
 * @param options  Auth config and base env.
 * @param execute  Callback that runs the agent with the given env.
 * @param getErrorMessage  Extracts an error string from a non-thrown result
 *                         (e.g. `result.error`). Return `undefined` if no error.
 */
export async function withAuthKeyRetry<T>(
  options: AuthKeyRetryOptions,
  execute: (env: Record<string, string>) => Promise<T>,
  getErrorMessage: (result: T) => string | undefined,
): Promise<T> {
  const profileCount = resolveAuthProfileCount(options.cfg, options.agentId);
  const maxAttempts = Math.max(1, profileCount);

  let lastResult: T | undefined;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const authEnv = await resolveAuthEnv({
      cfg: options.cfg,
      agentId: options.agentId,
      agentDir: options.agentDir,
      store: options.store,
    });
    const env = authEnv
      ? { ...options.baseEnv, ...authEnv }
      : options.baseEnv
        ? { ...options.baseEnv }
        : {};

    try {
      const result = await execute(env);

      // Check for rate-limit / auth errors returned in the result (not thrown).
      const errorMsg = getErrorMessage(result);
      if (errorMsg && isAuthRotatableError(errorMsg) && attempt + 1 < maxAttempts) {
        log.info(
          `Auth key rate-limited (attempt ${attempt + 1}/${maxAttempts}), rotating to next profile`,
        );
        lastResult = result;
        continue;
      }

      return result;
    } catch (err) {
      lastError = err;
      const errMsg = err instanceof Error ? err.message : String(err);
      if (isAuthRotatableError(errMsg) && attempt + 1 < maxAttempts) {
        log.info(
          `Auth key rate-limited (attempt ${attempt + 1}/${maxAttempts}), rotating to next profile`,
        );
        continue;
      }
      throw err;
    }
  }

  // All keys exhausted — return the last result or re-throw the last error.
  if (lastResult !== undefined) {
    return lastResult;
  }
  throw lastError;
}
