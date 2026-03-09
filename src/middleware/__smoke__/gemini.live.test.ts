import { randomBytes } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isTruthyEnvValue } from "../../infra/env.js";
import { ChannelBridge } from "../channel-bridge.js";
import { SessionMap } from "../session-map.js";
import type { ChannelMessage } from "../types.js";

const LIVE = isTruthyEnvValue(process.env.LIVE);

describe.skipIf(!LIVE)("gemini CLI middleware smoke test", () => {
  let bridge: ChannelBridge;
  let tempDir: string;
  let firstSessionId: string | undefined;

  const channelId = "smoke-test";
  const userId = "smoke-user";

  function makeMessage(text: string): ChannelMessage {
    return {
      id: randomBytes(4).toString("hex"),
      text,
      from: userId,
      channelId,
      provider: "test",
      timestamp: Date.now(),
    };
  }

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "rc-smoke-"));

    // Write a no-op MCP server script so the ChannelBridge MCP config points to a valid file
    const noopMcpServer = join(tempDir, "noop-mcp-server.js");
    await writeFile(noopMcpServer, "// no-op MCP server for smoke test\n");

    const sessionMap = new SessionMap(tempDir);
    bridge = new ChannelBridge({
      provider: "gemini",
      sessionMap,
      gatewayUrl: "",
      gatewayToken: "",
      workspaceDir: tempDir,
      mcpServerPath: noopMcpServer,
    });
  });

  afterAll(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("receives a coherent single-turn response", async () => {
    const result = await bridge.handle(makeMessage("What is 2+2? Reply with just the number."));

    expect(result.payloads.length).toBeGreaterThan(0);
    expect(result.run.text).toBeTruthy();
    expect(result.run.text).toContain("4");
    expect(result.run.sessionId).toBeTruthy();
    expect(result.run.aborted).toBe(false);
    expect(result.run.durationMs).toBeGreaterThan(0);

    firstSessionId = result.run.sessionId;
  }, 60_000);

  it("processes an image attachment and describes the content", async () => {
    // 100x100 solid red PNG
    const pngBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAIAAAD/gAIDAAABFUlEQVR4nO3OUQkAIABEsetfWiv4Nx4IC7Cd7XvkByF+EOIHIX4Q4gchfhDiByF+EOIHIX4Q4gchfhDiByF+EOIHIX4Q4gchfhDiByF+EOIHIX4Q4gchfhDiByF+EOIHIX4Q4gchfhDiByF+EOIHIX4Q4gchfhDiByF+EOIHIX4Q4gchfhDiByF+EOIHIX4Q4gchfhDiByF+EOIHIX4Q4gchfhDiByF+EOIHIX4Q4gchfhDiByF+EOIHIX4Q4gchfhDiByF+EOIHIX4Q4gchfhDiByF+EOIHIX4Q4gchfhDiByF+EOIHIX4Q4gchfhDiByF+EOIHIX4Q4gchfhDiByF+EOIHIX4Q4gchfhDiByF+EOIHIReeLesrH9s1agAAAABJRU5ErkJggg==";
    const testImagePath = join(tempDir, "test-image.png");
    await writeFile(testImagePath, Buffer.from(pngBase64, "base64"));

    const msg = makeMessage("What color is this image? Reply with just the color name.");
    msg.mediaUrls = [testImagePath];

    const result = await bridge.handle(msg);

    expect(result.payloads.length).toBeGreaterThan(0);
    expect(result.run.text).toBeTruthy();
    expect(result.run.text.toLowerCase()).toContain("red");
    expect(result.run.aborted).toBe(false);
    expect(result.run.sessionId).toBeTruthy();
  }, 60_000);

  it("processes an audio attachment and describes the content", async () => {
    // Generate a minimal WAV file with a 440Hz sine tone (1 second, 8kHz mono 16-bit)
    const sampleRate = 8000;
    const numSamples = sampleRate;
    const dataSize = numSamples * 2;
    const header = Buffer.alloc(44);
    header.write("RIFF", 0);
    header.writeUInt32LE(36 + dataSize, 4);
    header.write("WAVE", 8);
    header.write("fmt ", 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(sampleRate * 2, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write("data", 36);
    header.writeUInt32LE(dataSize, 40);
    const samples = Buffer.alloc(dataSize);
    for (let i = 0; i < numSamples; i++) {
      const sample = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0x7fff;
      samples.writeInt16LE(Math.round(sample), i * 2);
    }
    const testAudioPath = join(tempDir, "test-tone.wav");
    await writeFile(testAudioPath, Buffer.concat([header, samples]));

    const msg = makeMessage("What do you hear in this audio? Reply briefly.");
    msg.mediaUrls = [testAudioPath];

    const result = await bridge.handle(msg);

    expect(result.payloads.length).toBeGreaterThan(0);
    expect(result.run.text).toBeTruthy();
    expect(result.run.aborted).toBe(false);
    expect(result.run.sessionId).toBeTruthy();
  }, 60_000);

  it("resumes the session on a follow-up message", async () => {
    expect(firstSessionId).toBeTruthy();

    const result = await bridge.handle(
      makeMessage("What was the number I just asked about? Reply with just the number."),
    );

    expect(result.payloads.length).toBeGreaterThan(0);
    expect(result.run.text).toBeTruthy();
    expect(result.run.sessionId).toBe(firstSessionId);
    expect(result.run.aborted).toBe(false);
  }, 60_000);
});
