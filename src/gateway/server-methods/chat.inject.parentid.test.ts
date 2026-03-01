import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { appendInjectedAssistantMessageToTranscript } from "./chat-transcript-inject.js";
import { createTranscriptFixtureSync } from "./chat.test-helpers.js";

// Guardrail: Ensure gateway "injected" assistant transcript messages are appended as valid JSONL.
describe("gateway chat.inject transcript writes", () => {
  it("appends a valid JSONL message entry", async () => {
    const { dir, transcriptPath } = createTranscriptFixtureSync({
      prefix: "openclaw-chat-inject-",
      sessionId: "sess-1",
    });

    try {
      const appended = appendInjectedAssistantMessageToTranscript({
        transcriptPath,
        message: "hello",
      });
      expect(appended.ok).toBe(true);
      expect(appended.message).toBeTruthy();

      const lines = fs.readFileSync(transcriptPath, "utf-8").split(/\r?\n/).filter(Boolean);
      expect(lines.length).toBeGreaterThanOrEqual(2);

      const last = JSON.parse(lines.at(-1) as string) as {
        type?: string;
        message?: Record<string, unknown>;
      };
      expect(last.type).toBe("message");
      expect(last.message?.role).toBe("assistant");
      expect(last.message?.model).toBe("gateway-injected");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
