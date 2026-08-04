// The directories RemoteClaw owns, resolved from configuration rather than from
// whatever path is about to be trashed.
//
// `movePathToTrash`'s `allowedRoots` only bounds anything when the roots are
// known independently of the target. Roots derived from the target canonicalize
// to wherever the target canonicalizes, so `isPathInside` is trivially true and
// the check can never reject — the defect fixed in #3102. Every caller that
// wants containment sources its roots here (plus, where the target is
// user-configured and may legitimately live anywhere, that target's declared
// parent, which still rejects a symlink escaping it).
import os from "node:os";
import { resolveRequiredHomeDir } from "../infra/home-dir.js";
import { resolveConfigDir } from "../utils.js";
import { resolveLegacyStateDirs, resolveStateDir } from "./paths.js";

/**
 * Config/state directories this install owns, deduplicated and in no
 * particular order. Legacy state dirs are included because `resolveStateDir()`
 * and `resolveConfigPath()` both still resolve into them when no new-style dir
 * exists — omitting them would refuse to reset a legacy install.
 */
export function resolveOwnedStateRoots(env: NodeJS.ProcessEnv = process.env): string[] {
  const homedir = () => resolveRequiredHomeDir(env, os.homedir);
  const roots = [
    resolveConfigDir(env, homedir),
    resolveStateDir(env, homedir),
    ...resolveLegacyStateDirs(homedir),
  ];
  return [...new Set(roots.filter((root) => root.length > 0))];
}
