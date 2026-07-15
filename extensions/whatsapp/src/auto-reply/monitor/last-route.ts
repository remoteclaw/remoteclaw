import type { MsgContext } from "../../../../../src/auto-reply/templating.js";
import type { loadConfig } from "../../../../../src/config/config.js";
import { resolveStorePath, updateLastRoute } from "../../../../../src/config/sessions.js";
import { formatError } from "../../session.js";

export function trackBackgroundTask(
  backgroundTasks: Set<Promise<unknown>>,
  task: Promise<unknown>,
) {
  backgroundTasks.add(task);
  const cleanup = () => {
    backgroundTasks.delete(task);
  };
  // Attach cleanup as BOTH the fulfillment and rejection handler so a rejecting
  // tracked task does not leak an unhandled rejection. `void task.finally(...)`
  // re-rejects the chained promise (which nothing awaits) and leaks; a
  // `then(cleanup, cleanup)` swallows the settled reason after cleanup runs.
  task.then(cleanup, cleanup);
}

export function updateLastRouteInBackground(params: {
  cfg: ReturnType<typeof loadConfig>;
  backgroundTasks: Set<Promise<unknown>>;
  storeAgentId: string;
  sessionKey: string;
  channel: "whatsapp";
  to: string;
  accountId?: string;
  ctx?: MsgContext;
  warn: (obj: unknown, msg: string) => void;
}) {
  const storePath = resolveStorePath(params.cfg.session?.store, {
    agentId: params.storeAgentId,
  });
  const task = updateLastRoute({
    storePath,
    sessionKey: params.sessionKey,
    deliveryContext: {
      channel: params.channel,
      to: params.to,
      accountId: params.accountId,
    },
    ctx: params.ctx,
  }).catch((err) => {
    params.warn(
      {
        error: formatError(err),
        storePath,
        sessionKey: params.sessionKey,
        to: params.to,
      },
      "failed updating last route",
    );
  });
  trackBackgroundTask(params.backgroundTasks, task);
}

export function awaitBackgroundTasks(backgroundTasks: Set<Promise<unknown>>) {
  if (backgroundTasks.size === 0) {
    return Promise.resolve();
  }
  return Promise.allSettled(backgroundTasks).then(() => {
    backgroundTasks.clear();
  });
}
