// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { extractToolCards } from "../../../ui/chat/tool-cards.ts";

vi.mock("../../../components/icons.ts", () => ({
  icons: {},
}));

vi.mock("../../../lib/chat/tool-display.ts", () => ({
  formatToolDetail: () => undefined,
  resolveToolDisplay: ({ name }: { name: string }) => ({
    name,
    label:
      {
        sessions_spawn: "Sub-agent",
        skill_workshop: "Skill Workshop",
        web_search: "Web Search",
      }[name] ??
      name
        .split(/[._-]/g)
        .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
        .join(" "),
    icon: "zap",
  }),
}));

describe("tool-card extraction", () => {
  it("emits a call card carrying structured args verbatim", () => {
    const cards = extractToolCards({
      role: "assistant",
      content: [
        {
          type: "toolcall",
          name: "browser.open",
          arguments: { url: "https://example.com", retry: 0 },
        },
      ],
    });

    expect(cards).toHaveLength(1);
    expect(cards[0]?.kind).toBe("call");
    expect(cards[0]?.name).toBe("browser.open");
    expect(cards[0]?.args).toEqual({ url: "https://example.com", retry: 0 });
  });

  it("preserves string args verbatim", () => {
    const cards = extractToolCards({
      role: "assistant",
      content: [
        {
          type: "toolcall",
          name: "deck_manage",
          arguments: "with Example Deck",
        },
      ],
    });

    expect(cards).toHaveLength(1);
    expect(cards[0]?.kind).toBe("call");
    expect(cards[0]?.args).toBe("with Example Deck");
  });

  it("coerces JSON-string args into structured objects", () => {
    const cards = extractToolCards({
      role: "assistant",
      content: [
        {
          type: "toolcall",
          name: "read",
          arguments: '{"path":"README.md"}',
        },
      ],
    });

    expect(cards).toHaveLength(1);
    expect(cards[0]?.args).toEqual({ path: "README.md" });
  });

  it("emits separate call and result cards for a call/result pair", () => {
    const cards = extractToolCards({
      role: "assistant",
      content: [
        {
          type: "toolcall",
          name: "browser.open",
          arguments: { url: "https://example.com" },
        },
        {
          type: "toolresult",
          name: "browser.open",
          text: "Opened page",
        },
      ],
    });

    expect(cards).toHaveLength(2);
    expect(cards[0]?.kind).toBe("call");
    expect(cards[0]?.name).toBe("browser.open");
    expect(cards[1]?.kind).toBe("result");
    expect(cards[1]?.name).toBe("browser.open");
    expect(cards[1]?.text).toBe("Opened page");
  });

  it("reads tool result text from a string content field", () => {
    const cards = extractToolCards({
      role: "assistant",
      content: [
        {
          type: "tool_result",
          name: "read",
          content: "file body",
        },
      ],
    });

    expect(cards).toHaveLength(1);
    expect(cards[0]?.kind).toBe("result");
    expect(cards[0]?.text).toBe("file body");
  });

  it("falls back to a result card for a tool-result message without content items", () => {
    const cards = extractToolCards({
      role: "toolResult",
      toolName: "lookup",
      content: "lookup failed",
    });

    expect(cards).toHaveLength(1);
    expect(cards[0]?.kind).toBe("result");
    expect(cards[0]?.name).toBe("lookup");
  });

  it("returns no cards for a plain assistant text message", () => {
    const cards = extractToolCards({
      role: "assistant",
      content: [{ type: "text", text: "just talking" }],
    });

    expect(cards).toHaveLength(0);
  });
});

describe("tool-card canvas URLs", () => {
  async function loadResolver() {
    return vi.importActual<typeof import("../../../lib/chat/tool-display.ts")>(
      "../../../lib/chat/tool-display.ts",
    );
  }

  it("accepts hosted canvas paths and scopes them through the canvas capability host", async () => {
    const { resolveCanvasIframeUrl } = await loadResolver();

    expect(resolveCanvasIframeUrl("/__remoteclaw__/canvas/documents/cv_demo/index.html")).toBe(
      "/__remoteclaw__/canvas/documents/cv_demo/index.html",
    );
    expect(
      resolveCanvasIframeUrl(
        "/__remoteclaw__/canvas/documents/cv_demo/index.html",
        "http://127.0.0.1:19003/__remoteclaw__/cap/cap_123",
      ),
    ).toBe(
      "http://127.0.0.1:19003/__remoteclaw__/cap/cap_123/__remoteclaw__/canvas/documents/cv_demo/index.html",
    );
  });

  it("rejects unsafe canvas frame URLs unless external embeds are explicitly enabled", async () => {
    const { resolveCanvasIframeUrl } = await loadResolver();

    expect(resolveCanvasIframeUrl("/not-canvas/snake.html")).toBeUndefined();
    expect(resolveCanvasIframeUrl("https://example.com/evil.html")).toBeUndefined();
    expect(resolveCanvasIframeUrl("file:///tmp/snake.html")).toBeUndefined();
    expect(resolveCanvasIframeUrl("https://example.com/embed.html?x=1#y", undefined, true)).toBe(
      "https://example.com/embed.html?x=1#y",
    );
  });
});
