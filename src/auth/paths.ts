import fs from "node:fs";
import path from "node:path";
import { resolveStateDir } from "../config/paths.js";
import { saveJsonFile } from "../infra/json-file.js";
import { AUTH_PROFILE_FILENAME, AUTH_STORE_VERSION } from "./constants.js";
import type { AuthProfileStore } from "./types.js";

export function resolveAuthStorePath(): string {
  return path.join(resolveStateDir(), AUTH_PROFILE_FILENAME);
}

export function resolveAuthStorePathForDisplay(): string {
  return resolveAuthStorePath();
}

export function ensureAuthStoreFile(pathname: string) {
  if (fs.existsSync(pathname)) {
    return;
  }
  const payload: AuthProfileStore = {
    version: AUTH_STORE_VERSION,
    profiles: {},
  };
  saveJsonFile(pathname, payload);
}
