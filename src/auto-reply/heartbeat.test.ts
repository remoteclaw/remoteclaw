import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DEFAULT_HEARTBEAT_ACK_MAX_CHARS,
  resolveHeartbeatPrompt,
  stripHeartbeatToken,
} from "./heartbeat.js";
import { HEARTBEAT_TOKEN } from "./tokens.js";

let fixtureRoot = "";

beforeAll(async () => {
  fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), "remoteclaw-heartbeat-test-"));
});

afterAll(async () => {
  if (fixtureRoot) {
    await fs.rm(fixtureRoot, { recursive: true, force: true });
  }
});

describe("resolveHeartbeatPrompt", () => {
  it("returns empty string when neither prompt nor file is set", async () => {
    expect(await resolveHeartbeatPrompt({})).toBe("");
    expect(await resolveHeartbeatPrompt({ prompt: "", file: "" })).toBe("");
    expect(await resolveHeartbeatPrompt({ prompt: "   " })).toBe("");
  });

  it("returns trimmed prompt when set", async () => {
    expect(await resolveHeartbeatPrompt({ prompt: "  ping  " })).toBe("ping");
    expect(await resolveHeartbeatPrompt({ prompt: "Check health" })).toBe("Check health");
  });

  it("prompt takes precedence over file", async () => {
    const dir = path.join(fixtureRoot, "precedence");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "hb.md"), "File content", "utf-8");

    expect(
      await resolveHeartbeatPrompt({
        prompt: "Config prompt",
        file: "hb.md",
        workspaceDir: dir,
      }),
    ).toBe("Config prompt");
  });

  it("reads file relative to workspaceDir", async () => {
    const dir = path.join(fixtureRoot, "file-read");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "HEARTBEAT.md"), "- Check server\n- Review PRs\n", "utf-8");

    expect(
      await resolveHeartbeatPrompt({
        file: "HEARTBEAT.md",
        workspaceDir: dir,
      }),
    ).toBe("- Check server\n- Review PRs");
  });

  it("reads file with absolute path", async () => {
    const dir = path.join(fixtureRoot, "abs-path");
    await fs.mkdir(dir, { recursive: true });
    const absPath = path.join(dir, "custom.md");
    await fs.writeFile(absPath, "Absolute file content", "utf-8");

    expect(await resolveHeartbeatPrompt({ file: absPath })).toBe("Absolute file content");
  });

  it("returns empty string when file is missing", async () => {
    const dir = path.join(fixtureRoot, "missing-file");
    await fs.mkdir(dir, { recursive: true });

    expect(
      await resolveHeartbeatPrompt({
        file: "nonexistent.md",
        workspaceDir: dir,
      }),
    ).toBe("");
  });

  it("returns empty string when file is empty", async () => {
    const dir = path.join(fixtureRoot, "empty-file");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "empty.md"), "   \n\n  ", "utf-8");

    expect(
      await resolveHeartbeatPrompt({
        file: "empty.md",
        workspaceDir: dir,
      }),
    ).toBe("");
  });
});

describe("stripHeartbeatToken", () => {
  it("skips empty or token-only replies", () => {
    expect(stripHeartbeatToken(undefined, { mode: "heartbeat" })).toEqual({
      shouldSkip: true,
      text: "",
      didStrip: false,
    });
    expect(stripHeartbeatToken("  ", { mode: "heartbeat" })).toEqual({
      shouldSkip: true,
      text: "",
      didStrip: false,
    });
    expect(stripHeartbeatToken(HEARTBEAT_TOKEN, { mode: "heartbeat" })).toEqual({
      shouldSkip: true,
      text: "",
      didStrip: true,
    });
  });

  it("drops heartbeats with small junk in heartbeat mode", () => {
    expect(stripHeartbeatToken("HEARTBEAT_OK 🦞", { mode: "heartbeat" })).toEqual({
      shouldSkip: true,
      text: "",
      didStrip: true,
    });
    expect(stripHeartbeatToken(`🦞 ${HEARTBEAT_TOKEN}`, { mode: "heartbeat" })).toEqual({
      shouldSkip: true,
      text: "",
      didStrip: true,
    });
  });

  it("drops short remainder in heartbeat mode", () => {
    expect(stripHeartbeatToken(`ALERT ${HEARTBEAT_TOKEN}`, { mode: "heartbeat" })).toEqual({
      shouldSkip: true,
      text: "",
      didStrip: true,
    });
  });

  it("keeps heartbeat replies when remaining content exceeds threshold", () => {
    const long = "A".repeat(DEFAULT_HEARTBEAT_ACK_MAX_CHARS + 1);
    expect(stripHeartbeatToken(`${long} ${HEARTBEAT_TOKEN}`, { mode: "heartbeat" })).toEqual({
      shouldSkip: false,
      text: long,
      didStrip: true,
    });
  });

  it("strips token at edges for normal messages", () => {
    expect(stripHeartbeatToken(`${HEARTBEAT_TOKEN} hello`, { mode: "message" })).toEqual({
      shouldSkip: false,
      text: "hello",
      didStrip: true,
    });
    expect(stripHeartbeatToken(`hello ${HEARTBEAT_TOKEN}`, { mode: "message" })).toEqual({
      shouldSkip: false,
      text: "hello",
      didStrip: true,
    });
  });

  it("does not touch token in the middle", () => {
    expect(
      stripHeartbeatToken(`hello ${HEARTBEAT_TOKEN} there`, {
        mode: "message",
      }),
    ).toEqual({
      shouldSkip: false,
      text: `hello ${HEARTBEAT_TOKEN} there`,
      didStrip: false,
    });
  });

  it("strips HTML-wrapped heartbeat tokens", () => {
    expect(stripHeartbeatToken(`<b>${HEARTBEAT_TOKEN}</b>`, { mode: "heartbeat" })).toEqual({
      shouldSkip: true,
      text: "",
      didStrip: true,
    });
  });

  it("strips markdown-wrapped heartbeat tokens", () => {
    expect(stripHeartbeatToken(`**${HEARTBEAT_TOKEN}**`, { mode: "heartbeat" })).toEqual({
      shouldSkip: true,
      text: "",
      didStrip: true,
    });
  });

  it("removes markup-wrapped token and keeps trailing content", () => {
    expect(
      stripHeartbeatToken(`<code>${HEARTBEAT_TOKEN}</code> all good`, {
        mode: "message",
      }),
    ).toEqual({
      shouldSkip: false,
      text: "all good",
      didStrip: true,
    });
  });

  it("strips trailing punctuation only when directly after the token", () => {
    expect(stripHeartbeatToken(`${HEARTBEAT_TOKEN}.`, { mode: "heartbeat" })).toEqual({
      shouldSkip: true,
      text: "",
      didStrip: true,
    });
    expect(stripHeartbeatToken(`${HEARTBEAT_TOKEN}!!!`, { mode: "heartbeat" })).toEqual({
      shouldSkip: true,
      text: "",
      didStrip: true,
    });
    expect(stripHeartbeatToken(`${HEARTBEAT_TOKEN}---`, { mode: "heartbeat" })).toEqual({
      shouldSkip: true,
      text: "",
      didStrip: true,
    });
  });

  it("strips a sentence-ending token and keeps trailing punctuation", () => {
    expect(
      stripHeartbeatToken(`I should not respond ${HEARTBEAT_TOKEN}.`, {
        mode: "message",
      }),
    ).toEqual({
      shouldSkip: false,
      text: `I should not respond.`,
      didStrip: true,
    });
  });

  it("strips sentence-ending token with emphasis punctuation in heartbeat mode", () => {
    expect(
      stripHeartbeatToken(
        `There is nothing todo, so i should respond with ${HEARTBEAT_TOKEN} !!!`,
        {
          mode: "heartbeat",
        },
      ),
    ).toEqual({
      shouldSkip: true,
      text: "",
      didStrip: true,
    });
  });

  it("preserves trailing punctuation on text before the token", () => {
    expect(stripHeartbeatToken(`All clear. ${HEARTBEAT_TOKEN}`, { mode: "message" })).toEqual({
      shouldSkip: false,
      text: "All clear.",
      didStrip: true,
    });
  });
});
