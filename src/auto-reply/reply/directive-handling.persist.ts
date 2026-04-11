import type { RemoteClawConfig } from "../../config/config.js";
import { type SessionEntry, updateSessionStore } from "../../config/sessions.js";
import { applyVerboseOverride } from "../../sessions/level-overrides.js";
import type { InlineDirectives } from "./directive-handling.parse.js";

export async function persistInlineDirectives(params: {
  directives: InlineDirectives;
  cfg: RemoteClawConfig;
  sessionEntry?: SessionEntry;
  sessionStore?: Record<string, SessionEntry>;
  sessionKey?: string;
  storePath?: string;
}): Promise<void> {
  const { directives, sessionEntry, sessionStore, sessionKey, storePath } = params;
  if (sessionEntry && sessionStore && sessionKey) {
    let updated = false;

    if (directives.hasVerboseDirective && directives.verboseLevel) {
      applyVerboseOverride(sessionEntry, directives.verboseLevel);
      updated = true;
    }

    // Model directive handling gutted in RemoteClaw — CLI runtimes own model selection.

    if (directives.hasQueueDirective && directives.queueReset) {
      delete sessionEntry.queueMode;
      delete sessionEntry.queueDebounceMs;
      delete sessionEntry.queueCap;
      delete sessionEntry.queueDrop;
      updated = true;
    }

    if (updated) {
      sessionEntry.updatedAt = Date.now();
      sessionStore[sessionKey] = sessionEntry;
      if (storePath) {
        await updateSessionStore(storePath, (store) => {
          store[sessionKey] = sessionEntry;
        });
      }
    }
  }
}
