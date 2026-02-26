import { mkdtempSync, rmSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { McpSideEffectsWriter, readMcpSideEffects } from "./mcp-side-effects.js";

describe("McpSideEffectsWriter", () => {
  let dir: string;
  let filePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "mcp-se-"));
    filePath = join(dir, "side-effects.ndjson");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("records a message_sent side effect", async () => {
    const writer = new McpSideEffectsWriter(filePath);
    await writer.recordMessageSent({
      tool: "message",
      provider: "telegram",
      to: "group:123",
      text: "Hello",
    });

    const result = await readMcpSideEffects(filePath);
    expect(result.sentTexts).toEqual(["Hello"]);
    expect(result.sentTargets).toEqual([
      { tool: "message", provider: "telegram", to: "group:123" },
    ]);
    expect(result.sentMediaUrls).toEqual([]);
    expect(result.cronAdds).toBe(0);
  });

  it("records a message_sent with media URL", async () => {
    const writer = new McpSideEffectsWriter(filePath);
    await writer.recordMessageSent({
      tool: "message_send_attachment",
      provider: "discord",
      to: "channel:456",
      text: "Check this out",
      mediaUrl: "https://example.com/image.png",
    });

    const result = await readMcpSideEffects(filePath);
    expect(result.sentTexts).toEqual(["Check this out"]);
    expect(result.sentMediaUrls).toEqual(["https://example.com/image.png"]);
    expect(result.sentTargets).toEqual([
      { tool: "message_send_attachment", provider: "discord", to: "channel:456" },
    ]);
  });

  it("records a cron_added side effect", async () => {
    const writer = new McpSideEffectsWriter(filePath);
    await writer.recordCronAdd("job-xyz");

    const result = await readMcpSideEffects(filePath);
    expect(result.cronAdds).toBe(1);
    expect(result.sentTexts).toEqual([]);
  });

  it("records multiple side effects", async () => {
    const writer = new McpSideEffectsWriter(filePath);
    await writer.recordMessageSent({
      tool: "message",
      provider: "telegram",
      to: "group:1",
      text: "First",
    });
    await writer.recordMessageSent({
      tool: "message",
      provider: "telegram",
      to: "group:2",
      text: "Second",
      mediaUrl: "https://example.com/file.pdf",
    });
    await writer.recordCronAdd("job-1");
    await writer.recordCronAdd();

    const result = await readMcpSideEffects(filePath);
    expect(result.sentTexts).toEqual(["First", "Second"]);
    expect(result.sentMediaUrls).toEqual(["https://example.com/file.pdf"]);
    expect(result.sentTargets).toHaveLength(2);
    expect(result.cronAdds).toBe(2);
  });

  it("records message_sent with accountId", async () => {
    const writer = new McpSideEffectsWriter(filePath);
    await writer.recordMessageSent({
      tool: "message",
      provider: "slack",
      accountId: "T12345",
      to: "C67890",
      text: "Hello Slack",
    });

    const result = await readMcpSideEffects(filePath);
    expect(result.sentTargets).toEqual([
      { tool: "message", provider: "slack", accountId: "T12345", to: "C67890" },
    ]);
  });
});

describe("readMcpSideEffects", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "mcp-se-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns empty result for non-existent file", async () => {
    const result = await readMcpSideEffects(join(dir, "nonexistent.ndjson"));
    expect(result).toEqual({
      sentTexts: [],
      sentMediaUrls: [],
      sentTargets: [],
      cronAdds: 0,
    });
  });

  it("skips malformed lines", async () => {
    const filePath = join(dir, "effects.ndjson");
    await writeFile(
      filePath,
      '{"type":"message_sent","tool":"m","provider":"t","to":"1","text":"ok","mediaUrl":null,"ts":1}\n' +
        "not-json\n" +
        '{"type":"cron_added","ts":2}\n',
      "utf-8",
    );

    const result = await readMcpSideEffects(filePath);
    expect(result.sentTexts).toEqual(["ok"]);
    expect(result.cronAdds).toBe(1);
  });

  it("handles empty file", async () => {
    const filePath = join(dir, "empty.ndjson");
    await writeFile(filePath, "", "utf-8");

    const result = await readMcpSideEffects(filePath);
    expect(result).toEqual({
      sentTexts: [],
      sentMediaUrls: [],
      sentTargets: [],
      cronAdds: 0,
    });
  });
});
