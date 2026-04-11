// Stub — gutted in RemoteClaw fork
import type { AuthProfileStore } from "./types.js";

const EMPTY_STORE: AuthProfileStore = { version: 1, profiles: {} };

export const clearRuntimeAuthProfileStoreSnapshots = (..._args: unknown[]) => {};
export const ensureAuthProfileStore = (..._args: unknown[]): AuthProfileStore => EMPTY_STORE;
export const loadAuthProfileStoreForRuntime = (..._args: unknown[]) => Promise.resolve(EMPTY_STORE);
export const replaceRuntimeAuthProfileStoreSnapshots = (..._args: unknown[]) => {};
export const loadAuthProfileStore = (..._args: unknown[]) => EMPTY_STORE;
export const saveAuthProfileStore = (..._args: unknown[]) => {};
