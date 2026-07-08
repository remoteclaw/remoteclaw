import { describe, expect, it } from "vitest";
import { formatCliFailureLines } from "./failure-output.js";

describe("formatCliFailureLines", () => {
  it("shows a concise reason and recovery commands by default", () => {
    const lines = formatCliFailureLines({
      title: "Could not start the CLI.",
      error: new Error("config file is invalid"),
      argv: ["node", "remoteclaw", "status"],
      env: {},
    });

    expect(lines).toContain("[remoteclaw] Could not start the CLI.");
    expect(lines).toContain("[remoteclaw] Reason: config file is invalid");
    expect(lines).toContain(
      "[remoteclaw] Debug: set REMOTECLAW_DEBUG=1 to include the stack trace.",
    );
    expect(lines).toContain("[remoteclaw] Try: remoteclaw doctor");
    expect(lines).toContain("[remoteclaw] Help: remoteclaw --help");
  });

  it("prints stack details when debug output is requested", () => {
    const lines = formatCliFailureLines({
      title: "The CLI command failed.",
      error: new Error("boom"),
      env: { REMOTECLAW_DEBUG: "1" },
    });

    expect(lines).toContain("[remoteclaw] Stack:");
    expect(lines.some((line) => line.includes("Error: boom"))).toBe(true);
  });
});
