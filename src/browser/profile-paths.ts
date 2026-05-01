import path from "node:path";
import { CONFIG_DIR } from "../utils.js";
import { DEFAULT_REMOTECLAW_BROWSER_PROFILE_NAME } from "./constants.js";

export function resolveRemoteClawUserDataDir(profileName = DEFAULT_REMOTECLAW_BROWSER_PROFILE_NAME): string {
  return path.join(CONFIG_DIR, "browser", profileName, "user-data");
}
