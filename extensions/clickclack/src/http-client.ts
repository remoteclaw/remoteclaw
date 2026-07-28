/**
 * Thin ClickClack REST/websocket client used by gateway, resolver, and outbound
 * delivery code.
 *
 * Talks directly to the operator-configured `baseUrl` rather than routing
 * through the fork's SSRF dispatcher: ClickClack is a self-hosted deployment
 * whose endpoint comes from trusted local config, never from inbound payloads.
 * See #2861 for the explicit posture call.
 */
import { WebSocket } from "ws";
import type {
  ClickClackChannel,
  ClickClackEvent,
  ClickClackMessage,
  ClickClackUser,
  ClickClackWorkspace,
} from "./types.js";

type ClientOptions = {
  baseUrl: string;
  token: string;
  fetch?: typeof fetch;
};

/**
 * Creates a typed client for the ClickClack API using bearer-token auth.
 */
export function createClickClackClient(options: ClientOptions) {
  const baseUrl = options.baseUrl.replace(/\/$/, "");
  const headers = {
    Authorization: `Bearer ${options.token}`,
    Accept: "application/json",
  };

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const requestHeaders = new Headers(init.headers);
    for (const [key, value] of Object.entries(headers)) {
      requestHeaders.set(key, value);
    }
    if (init.body && !(init.body instanceof FormData)) {
      requestHeaders.set("Content-Type", "application/json");
    }
    const url = `${baseUrl}${path}`;
    const requestInit = { ...init, headers: requestHeaders };
    // Deliberately a raw `fetch` rather than the SSRF dispatcher — see the
    // module header for the posture. Spelled as a direct call (not an aliased
    // `fetcher` binding) so `scripts/check-no-raw-channel-fetch.mjs` can see the
    // callsite and the exception stays on that gate's allowlist ledger instead
    // of being invisible to it.
    const response = await (options.fetch
      ? options.fetch(url, requestInit)
      : fetch(url, requestInit));
    if (!response.ok) {
      // Name the endpoint: this surfaces to the operator as a channel-exit
      // reason and burns a restart attempt, so "403" alone cannot be acted on.
      // Path and status only — never headers, which carry the bearer token.
      throw new Error(
        `ClickClack ${init.method ?? "GET"} ${path} -> ${response.status}: ${await response.text()}`,
      );
    }
    return (await response.json()) as T;
  }

  return {
    me: async (): Promise<ClickClackUser> => {
      const data = await request<{ user: ClickClackUser }>("/api/me");
      return data.user;
    },
    workspaces: async (): Promise<ClickClackWorkspace[]> => {
      const data = await request<{ workspaces: ClickClackWorkspace[] }>("/api/workspaces");
      return data.workspaces;
    },
    channels: async (workspaceId: string): Promise<ClickClackChannel[]> => {
      const data = await request<{ channels: ClickClackChannel[] }>(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/channels`,
      );
      return data.channels;
    },
    channelMessages: async (
      channelId: string,
      afterSeq: number,
      limit = 20,
    ): Promise<ClickClackMessage[]> => {
      const data = await request<{ messages: ClickClackMessage[] }>(
        `/api/channels/${encodeURIComponent(channelId)}/messages?after_seq=${afterSeq}&limit=${limit}`,
      );
      return data.messages;
    },
    directMessages: async (
      conversationId: string,
      afterSeq: number,
      limit = 20,
    ): Promise<ClickClackMessage[]> => {
      const data = await request<{ messages: ClickClackMessage[] }>(
        `/api/dms/${encodeURIComponent(conversationId)}/messages?after_seq=${afterSeq}&limit=${limit}`,
      );
      return data.messages;
    },
    thread: async (
      messageId: string,
    ): Promise<{ root: ClickClackMessage; replies: ClickClackMessage[] }> =>
      await request<{ root: ClickClackMessage; replies: ClickClackMessage[] }>(
        `/api/messages/${encodeURIComponent(messageId)}/thread`,
      ),
    createChannelMessage: async (channelId: string, body: string): Promise<ClickClackMessage> => {
      const data = await request<{ message: ClickClackMessage }>(
        `/api/channels/${encodeURIComponent(channelId)}/messages`,
        { method: "POST", body: JSON.stringify({ body }) },
      );
      return data.message;
    },
    createThreadReply: async (messageId: string, body: string): Promise<ClickClackMessage> => {
      const data = await request<{ message: ClickClackMessage }>(
        `/api/messages/${encodeURIComponent(messageId)}/thread/replies`,
        { method: "POST", body: JSON.stringify({ body }) },
      );
      return data.message;
    },
    createDirectConversation: async (
      workspaceId: string,
      memberIds: string[],
    ): Promise<{ id: string }> => {
      const data = await request<{ conversation: { id: string } }>("/api/dms", {
        method: "POST",
        body: JSON.stringify({ workspace_id: workspaceId, member_ids: memberIds }),
      });
      return data.conversation;
    },
    createDirectMessage: async (
      conversationId: string,
      body: string,
    ): Promise<ClickClackMessage> => {
      const data = await request<{ message: ClickClackMessage }>(
        `/api/dms/${encodeURIComponent(conversationId)}/messages`,
        { method: "POST", body: JSON.stringify({ body }) },
      );
      return data.message;
    },
    events: async (workspaceId: string, afterCursor?: string): Promise<ClickClackEvent[]> => {
      const query = new URLSearchParams({ workspace_id: workspaceId });
      if (afterCursor) {
        query.set("after_cursor", afterCursor);
      }
      const data = await request<{ events: ClickClackEvent[] }>(
        `/api/realtime/events?${query.toString()}`,
      );
      return data.events;
    },
    websocket: (workspaceId: string, afterCursor?: string): WebSocket => {
      const url = new URL(`${baseUrl}/api/realtime/ws`);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      url.searchParams.set("workspace_id", workspaceId);
      if (afterCursor) {
        url.searchParams.set("after_cursor", afterCursor);
      }
      return new WebSocket(url, {
        headers: {
          Authorization: `Bearer ${options.token}`,
        },
      });
    },
  };
}

/** Client shape returned by `createClickClackClient`. */
export type ClickClackClient = ReturnType<typeof createClickClackClient>;
