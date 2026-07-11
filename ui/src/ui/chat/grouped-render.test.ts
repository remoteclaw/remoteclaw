/* @vitest-environment jsdom */

import { render } from "lit";
import { describe, expect, it, vi } from "vitest";
import type { MessageGroup } from "../types/chat-types.ts";
import { renderMessageGroup, renderStreamingGroup } from "./grouped-render.ts";

vi.mock("../markdown.ts", () => ({
  toSanitizedMarkdownHtml: (value: string) => value,
}));

vi.mock("../icons.ts", () => ({
  icons: {},
}));

vi.mock("../tool-display.ts", () => ({
  formatToolDetail: () => undefined,
  resolveToolDisplay: ({ name }: { name: string }) => ({
    name,
    label: name,
    icon: "zap",
  }),
}));

function makeGroup(
  role: string,
  messages: MessageGroup["messages"],
  senderLabel?: string,
): MessageGroup {
  return {
    kind: "group",
    key: `${role}-group`,
    role,
    senderLabel,
    messages,
    timestamp: 1000,
    isStreaming: false,
  };
}

function entry(message: unknown, key = "m0"): MessageGroup["messages"][number] {
  return { key, message };
}

describe("renderMessageGroup", () => {
  it("renders a user message with its text and the default 'You' label", () => {
    const container = document.createElement("div");
    render(
      renderMessageGroup(makeGroup("user", [entry({ role: "user", content: "hello there" })]), {
        showReasoning: false,
      }),
      container,
    );

    expect(container.querySelector(".chat-group.user")).not.toBeNull();
    expect(container.querySelector(".chat-text")?.textContent).toContain("hello there");
    expect(container.querySelector(".chat-sender-name")?.textContent).toBe("You");
  });

  it("uses the group sender label for user messages when present", () => {
    const container = document.createElement("div");
    render(
      renderMessageGroup(makeGroup("user", [entry({ role: "user", content: "hi" })], "Alice"), {
        showReasoning: false,
      }),
      container,
    );

    expect(container.querySelector(".chat-sender-name")?.textContent).toBe("Alice");
  });

  it("labels assistant groups with the assistant name and a text avatar", () => {
    const container = document.createElement("div");
    render(
      renderMessageGroup(makeGroup("assistant", [entry({ role: "assistant", content: "sure" })]), {
        showReasoning: false,
        assistantName: "Nova",
        assistantAvatar: "N",
      }),
      container,
    );

    expect(container.querySelector(".chat-group.assistant")).not.toBeNull();
    expect(container.querySelector(".chat-sender-name")?.textContent).toBe("Nova");
    expect(container.querySelector(".chat-avatar.assistant")?.textContent?.trim()).toBe("N");
  });

  it("renders a URL assistant avatar as an image", () => {
    const container = document.createElement("div");
    render(
      renderMessageGroup(makeGroup("assistant", [entry({ role: "assistant", content: "sure" })]), {
        showReasoning: false,
        assistantName: "Nova",
        assistantAvatar: "/avatar/main.png",
      }),
      container,
    );

    const avatar = container.querySelector<HTMLImageElement>("img.chat-avatar.assistant");
    expect(avatar).not.toBeNull();
    expect(avatar?.getAttribute("src")).toBe("/avatar/main.png");
  });

  it("renders tool cards for tool-result messages", () => {
    const container = document.createElement("div");
    render(
      renderMessageGroup(
        makeGroup("assistant", [
          entry({
            role: "toolResult",
            content: [{ type: "tool_result", name: "read", text: "file body" }],
          }),
        ]),
        { showReasoning: false },
      ),
      container,
    );

    expect(container.querySelector(".chat-tool-card")).not.toBeNull();
  });
});

describe("renderStreamingGroup", () => {
  it("renders an assistant streaming group with a timestamp footer", () => {
    const container = document.createElement("div");
    render(renderStreamingGroup("thinking out loud", 1000), container);

    expect(container.querySelector(".chat-group.assistant")).not.toBeNull();
    expect(container.querySelector(".chat-sender-name")?.textContent).toBe("Assistant");
    expect(container.querySelector(".chat-group-timestamp")).not.toBeNull();
  });
});
