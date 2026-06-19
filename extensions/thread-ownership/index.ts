import { normalizeOptionalString } from "remoteclaw/plugin-sdk/text-runtime";
import {
  fetchWithSsrFGuard,
  ssrfPolicyFromAllowPrivateNetwork,
  type RemoteClawConfig,
  type RemoteClawPluginApi,
} from "remoteclaw/plugin-sdk/thread-ownership";

type ThreadOwnershipConfig = {
  forwarderUrl?: string;
  abTestChannels?: string[];
};

type AgentEntry = NonNullable<NonNullable<RemoteClawConfig["agents"]>["list"]>[number];

// In-memory set of {channel}:{thread} keys where this agent was @-mentioned.
// Entries expire after 5 minutes.
const mentionedThreads = new Map<string, number>();
const MENTION_TTL_MS = 5 * 60 * 1000;

// Coerce a thread token (string | number | unknown) to a string key; "" when absent.
function resolveThreadToken(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

// Canonicalize a Slack conversation id: strip an optional "slack:"/"channel:" prefix and
// upper-case canonical Slack id shapes ([CDGUW]...), so inbound and outbound routing keys
// match regardless of the prefix or casing supplied by the channel adapter.
function resolveSlackConversationId(value: unknown): string {
  const raw = normalizeOptionalString(value) ?? "";
  if (!raw) {
    return "";
  }
  const trimmed = raw.trim();
  const match = /^(?:slack:)?channel:(.+)$/i.exec(trimmed);
  const resolved = match?.[1]?.trim() || trimmed;
  return /^[CDGUW][A-Z0-9]+$/i.test(resolved) ? resolved.toUpperCase() : resolved;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Match a standalone @name mention (word-boundary, case-insensitive) so that superset
// handles (e.g. @testbot2) and email-like text (e.g. foo@testbot.com) are not mistaken
// for a mention of the agent.
function containsAgentNameMention(text: string, agentName: string): boolean {
  const trimmedName = agentName.trim();
  if (!trimmedName) {
    return false;
  }
  return new RegExp(`(^|[^\\w])@${escapeRegExp(trimmedName)}(?=$|[^\\w])`, "i").test(text);
}

function cleanExpiredMentions(): void {
  const now = Date.now();
  for (const [key, ts] of mentionedThreads) {
    if (now - ts > MENTION_TTL_MS) {
      mentionedThreads.delete(key);
    }
  }
}

function resolveOwnershipAgent(config: RemoteClawConfig): { id: string; name: string } {
  const list = Array.isArray(config.agents?.list)
    ? config.agents.list.filter((entry): entry is AgentEntry =>
        Boolean(entry && typeof entry === "object"),
      )
    : [];
  const selected = list.find((entry) => entry.default === true) ?? list[0];

  const id = normalizeOptionalString(selected?.id) ?? "unknown";
  const identityName = normalizeOptionalString(selected?.identity?.name) ?? "";
  const fallbackName = normalizeOptionalString(selected?.name) ?? "";
  const name = identityName || fallbackName;

  return { id, name };
}

export default function register(api: RemoteClawPluginApi) {
  const pluginCfg = (api.pluginConfig ?? {}) as ThreadOwnershipConfig;
  const forwarderUrl = (
    pluginCfg.forwarderUrl ??
    process.env.SLACK_FORWARDER_URL ??
    "http://slack-forwarder:8750"
  ).replace(/\/$/, "");

  const abTestChannels = new Set(
    (
      pluginCfg.abTestChannels ??
      process.env.THREAD_OWNERSHIP_CHANNELS?.split(",").filter(Boolean) ??
      []
    )
      .map((entry) => resolveSlackConversationId(entry))
      .filter(Boolean),
  );

  const { id: agentId, name: agentName } = resolveOwnershipAgent(api.config);
  const botUserId = process.env.SLACK_BOT_USER_ID ?? "";

  // ---------------------------------------------------------------------------
  // message_received: track @-mentions so the agent can reply even if it
  // doesn't own the thread.
  // ---------------------------------------------------------------------------
  api.on("message_received", async (event, ctx) => {
    if (ctx.channelId !== "slack") return;

    const text = event.content ?? "";
    // The inbound mapper carries the thread anchor in metadata.threadId (not threadTs),
    // so read both to track mentions across channel-adapter metadata shapes.
    const threadTs =
      resolveThreadToken(event.metadata?.threadId) || resolveThreadToken(event.metadata?.threadTs);
    const channelId =
      resolveSlackConversationId(ctx.conversationId) ||
      resolveSlackConversationId(event.metadata?.channelId) ||
      "";

    if (!threadTs || !channelId) return;

    // Check if this agent was @-mentioned (case-insensitive, word-boundary).
    const mentioned =
      containsAgentNameMention(text, agentName) || (botUserId && text.includes(`<@${botUserId}>`));

    if (mentioned) {
      cleanExpiredMentions();
      mentionedThreads.set(`${channelId}:${threadTs}`, Date.now());
    }
  });

  // ---------------------------------------------------------------------------
  // message_sending: check thread ownership before sending to Slack.
  // Returns { cancel: true } if another agent owns the thread.
  // ---------------------------------------------------------------------------
  api.on("message_sending", async (event, ctx) => {
    if (ctx.channelId !== "slack") return;

    // Slack threading anchors arrive via metadata; replyToId is the canonical reply target.
    const threadTs =
      resolveThreadToken(event.metadata?.replyToId) ||
      resolveThreadToken(event.metadata?.threadId) ||
      resolveThreadToken(event.metadata?.threadTs);
    const channelId =
      resolveSlackConversationId(ctx.conversationId) ||
      resolveSlackConversationId(event.metadata?.channelId) ||
      resolveSlackConversationId(event.to) ||
      "";

    // Top-level messages (no thread) or an unresolved channel are always allowed (fail open).
    if (!threadTs || !channelId) return;

    // Only enforce in A/B test channels (if set is empty, skip entirely).
    if (abTestChannels.size > 0 && !abTestChannels.has(channelId)) return;

    // If this agent was @-mentioned in this thread recently, skip ownership check.
    cleanExpiredMentions();
    if (mentionedThreads.has(`${channelId}:${threadTs}`)) return;

    // Try to claim ownership via the forwarder HTTP API.
    try {
      // The forwarder is an internal service (e.g. a Docker container); allow private-network
      // access but pin DNS so DNS-rebinding attacks cannot pivot to a different internal host.
      const { response: resp, release } = await fetchWithSsrFGuard({
        url: `${forwarderUrl}/api/v1/ownership/${channelId}/${threadTs}`,
        init: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agent_id: agentId }),
        },
        timeoutMs: 3000,
        policy: ssrfPolicyFromAllowPrivateNetwork(true),
        auditContext: "thread-ownership",
      });

      try {
        if (resp.ok) {
          // We own it (or just claimed it), proceed.
          return;
        }

        if (resp.status === 409) {
          // Another agent owns this thread — cancel the send.
          const body = (await resp.json()) as { owner?: string };
          api.logger.info?.(
            `thread-ownership: cancelled send to ${channelId}:${threadTs} — owned by ${body.owner}`,
          );
          return { cancel: true };
        }

        // Unexpected status — fail open.
        api.logger.warn?.(`thread-ownership: unexpected status ${resp.status}, allowing send`);
      } finally {
        await release();
      }
    } catch (err) {
      // Network error — fail open.
      api.logger.warn?.(`thread-ownership: ownership check failed (${String(err)}), allowing send`);
    }
  });
}
