import { describe, expect, it } from "vitest";
import { buildCronEventPrompt, buildExecEventPrompt } from "./heartbeat-events-filter.js";

describe("heartbeat event prompts", () => {
  it("builds user-relay cron prompt by default", () => {
    const prompt = buildCronEventPrompt(["Cron: rotate logs"]);
    expect(prompt).toContain("Please relay this reminder to the user");
  });

  it("builds internal-only cron prompt when delivery is disabled", () => {
    const prompt = buildCronEventPrompt(["Cron: rotate logs"], { deliverToUser: false });
    expect(prompt).toContain("Handle this reminder internally");
    expect(prompt).not.toContain("Please relay this reminder to the user");
  });

  it.each([
    {
      name: "builds user-relay exec prompt by default",
      events: ["Exec finished (node=abc id=123, code 0)\nUploaded file"],
      opts: undefined,
      expected: [
        "Exec finished",
        "Uploaded file",
        "Please relay the command output to the user",
        "If it failed",
      ],
      unexpected: ["system messages above", "Handle the result internally"],
    },
    {
      name: "builds internal-only exec prompt when delivery is disabled",
      events: ["Exec failed (node=abc id=123, code 1)\nUpload failed"],
      opts: { deliverToUser: false },
      expected: ["user delivery is disabled", "Handle the result internally", "HEARTBEAT_OK only"],
      unexpected: [
        "Upload failed",
        "system messages above",
        "Please relay the command output to the user",
      ],
    },
    {
      name: "suppresses empty exec completion prompts",
      events: ["", "   "],
      opts: undefined,
      expected: ["no command output was found", "Reply HEARTBEAT_OK only"],
      unexpected: ["Please relay the command output to the user", "system messages above"],
    },
  ])("$name", ({ events, opts, expected, unexpected }) => {
    const prompt = buildExecEventPrompt(events, opts);
    for (const part of expected) {
      expect(prompt).toContain(part);
    }
    for (const part of unexpected) {
      expect(prompt).not.toContain(part);
    }
  });

  it("truncates oversized user-relay exec prompt output", () => {
    const prompt = buildExecEventPrompt([`Exec finished: ${"x".repeat(8_100)}`]);

    expect(prompt).toContain("[truncated]");
    expect(prompt.length).toBeLessThan(8_500);
  });
});
