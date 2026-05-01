import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveHeartbeatPrompt } from "./heartbeat.js";

vi.mock("node:fs/promises");

afterEach(() => {
  vi.restoreAllMocks();
});

describe("resolveHeartbeatPrompt", () => {
  it("returns empty string when nothing is configured", async () => {
    expect(await resolveHeartbeatPrompt({})).toBe("");
    expect(await resolveHeartbeatPrompt({ prompt: undefined })).toBe("");
  });

  it("returns empty string when prompt is empty or whitespace", async () => {
    expect(await resolveHeartbeatPrompt({ prompt: "" })).toBe("");
    expect(await resolveHeartbeatPrompt({ prompt: "   " })).toBe("");
    expect(await resolveHeartbeatPrompt({ prompt: "  \n\t  " })).toBe("");
  });

  it("returns trimmed prompt when set", async () => {
    expect(await resolveHeartbeatPrompt({ prompt: "  ping  " })).toBe("ping");
    expect(await resolveHeartbeatPrompt({ prompt: "Check health" })).toBe("Check health");
  });

  it("returns prompt with internal whitespace preserved", async () => {
    expect(await resolveHeartbeatPrompt({ prompt: "line 1\nline 2" })).toBe("line 1\nline 2");
  });

  it("prompt takes precedence over file", async () => {
    expect(await resolveHeartbeatPrompt({ prompt: "inline", file: "heartbeat.txt" })).toBe(
      "inline",
    );
  });

  it("reads file when prompt is empty", async () => {
    vi.mocked(fs.readFile).mockResolvedValue("file prompt content");
    expect(
      await resolveHeartbeatPrompt({ file: "heartbeat.txt", workspaceDir: "/workspace" }),
    ).toBe("file prompt content");
    expect(fs.readFile).toHaveBeenCalledWith(path.join("/workspace", "heartbeat.txt"), "utf-8");
  });

  it("uses absolute file path as-is", async () => {
    vi.mocked(fs.readFile).mockResolvedValue("absolute content");
    expect(
      await resolveHeartbeatPrompt({ file: "/etc/heartbeat.txt", workspaceDir: "/workspace" }),
    ).toBe("absolute content");
    expect(fs.readFile).toHaveBeenCalledWith("/etc/heartbeat.txt", "utf-8");
  });

  it("returns empty string when file is missing", async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"));
    expect(await resolveHeartbeatPrompt({ file: "missing.txt", workspaceDir: "/workspace" })).toBe(
      "",
    );
  });

  it("returns empty string when file content is empty", async () => {
    vi.mocked(fs.readFile).mockResolvedValue("   ");
    expect(await resolveHeartbeatPrompt({ file: "empty.txt", workspaceDir: "/workspace" })).toBe(
      "",
    );
  });
});
