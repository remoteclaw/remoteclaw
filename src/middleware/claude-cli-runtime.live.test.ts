import { describe, expect, it } from "vitest";
import { ClaudeCliRuntime } from "./claude-cli-runtime.js";
import type { AgentEvent } from "./types.js";

const LIVE = process.env.LIVE === "1";

describe.skipIf(!LIVE)("ClaudeCliRuntime (live)", () => {
  it("sends a prompt and gets a response", async () => {
    const runtime = new ClaudeCliRuntime();
    const events: AgentEvent[] = [];

    for await (const event of runtime.execute({
      prompt: "Reply with exactly: PONG",
      sessionId: undefined,
      workspaceDir: process.cwd(),
    })) {
      events.push(event);
    }

    const doneEvent = events.find((e) => e.type === "done");
    expect(doneEvent).toBeDefined();
    expect(doneEvent!.type === "done" && doneEvent!.result.text).toContain("PONG");
  }, 120_000);

  it("resumes a session", async () => {
    const runtime = new ClaudeCliRuntime();

    // First call: tell it to remember a word
    const events1: AgentEvent[] = [];
    for await (const event of runtime.execute({
      prompt: 'Remember the secret word "FLAMINGO". Reply with just "OK".',
      sessionId: undefined,
      workspaceDir: process.cwd(),
    })) {
      events1.push(event);
    }

    const done1 = events1.find((e) => e.type === "done");
    expect(done1).toBeDefined();
    const sessionId = done1!.type === "done" ? done1!.result.sessionId : undefined;
    expect(sessionId).toBeDefined();

    // Second call: resume and ask for the word
    const events2: AgentEvent[] = [];
    for await (const event of runtime.execute({
      prompt: "What was the secret word I told you? Reply with just the word.",
      sessionId,
      workspaceDir: process.cwd(),
    })) {
      events2.push(event);
    }

    const done2 = events2.find((e) => e.type === "done");
    expect(done2).toBeDefined();
    expect(done2!.type === "done" && done2!.result.text).toContain("FLAMINGO");
  }, 180_000);
});
