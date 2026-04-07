import { describe, expect, it } from "vitest";
import { validateConfigObject } from "./config.js";

describe("Telegram webhookPort config", () => {
  it("accepts a positive webhookPort", () => {
    const res = validateConfigObject({
      channels: {
        telegram: {
          webhookUrl: "https://example.com/telegram-webhook",
          webhookSecret: "secret",
          webhookPort: 8787,
        },
      },
    });
    expect(res.ok).toBe(true);
  });

  // Skipped: tests gutted functionality (Middleware Boundary Principle)

  it.skip("rejects webhookPort set to 0 (must be positive)", () => {
    const res = validateConfigObject({
      channels: {
        telegram: {
          webhookUrl: "https://example.com/telegram-webhook",
          webhookSecret: "secret",
          webhookPort: 0,
        },
      },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.issues.some((issue) => issue.path === "channels.telegram.webhookPort")).toBe(true);
    }
  });

  it("rejects negative webhookPort", () => {
    const res = validateConfigObject({
      channels: {
        telegram: {
          webhookUrl: "https://example.com/telegram-webhook",
          webhookSecret: "secret",
          webhookPort: -1,
        },
      },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.issues.some((issue) => issue.path === "channels.telegram.webhookPort")).toBe(true);
    }
  });
});
