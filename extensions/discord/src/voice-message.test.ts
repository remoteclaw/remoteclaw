import fs from "node:fs/promises";
import path from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const runFfprobeMock = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<string>>());
const runFfmpegMock = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<void>>());

vi.mock("remoteclaw/plugin-sdk/temp-path", async () => {
  return {
    resolvePreferredRemoteClawTmpDir: () => "/tmp",
  };
});

vi.mock("remoteclaw/plugin-sdk/media-runtime", async () => {
  return {
    runFfprobe: runFfprobeMock,
    runFfmpeg: runFfmpegMock,
    parseFfprobeCodecAndSampleRate: (stdout: string) => {
      const [codec, sampleRate] = stdout.trim().split(",");
      return {
        codec,
        sampleRateHz: Number(sampleRate),
      };
    },
    MEDIA_FFMPEG_MAX_AUDIO_DURATION_SECS: 1200,
    unlinkIfExists: vi.fn(async () => {}),
  };
});

let ensureOggOpus: typeof import("./voice-message.js").ensureOggOpus;

describe("ensureOggOpus", () => {
  beforeAll(async () => {
    ({ ensureOggOpus } = await import("./voice-message.js"));
  });

  beforeEach(() => {
    runFfprobeMock.mockReset();
    runFfmpegMock.mockReset();
  });

  function expectStagedFfmpegOutput(ffmpegOutputPath: string | undefined, finalPath: string) {
    expect(ffmpegOutputPath).toBeTypeOf("string");
    if (typeof ffmpegOutputPath !== "string") {
      throw new Error("missing ffmpeg output path");
    }
    expect(ffmpegOutputPath).not.toBe(finalPath);
    const stagedBase = path.basename(ffmpegOutputPath);
    expect(stagedBase.startsWith(".fs-safe-output-")).toBe(true);
    expect(stagedBase.endsWith(`-${path.basename(finalPath)}.part`)).toBe(true);
  }

  function readSingleCommandArgs(mock: typeof runFfprobeMock | typeof runFfmpegMock): string[] {
    const [call] = mock.mock.calls;
    if (!call) {
      throw new Error("missing command call");
    }
    const [args] = call;
    if (!Array.isArray(args) || !args.every((arg): arg is string => typeof arg === "string")) {
      throw new Error("missing command args");
    }
    return args;
  }

  it("rejects URL/protocol input paths", async () => {
    await expect(ensureOggOpus("https://example.com/audio.ogg")).rejects.toThrow(
      /local file path/i,
    );
    expect(runFfprobeMock).not.toHaveBeenCalled();
    expect(runFfmpegMock).not.toHaveBeenCalled();
  });

  it("keeps .ogg only when codec is opus and sample rate is 48kHz", async () => {
    runFfprobeMock.mockResolvedValueOnce("opus,48000\n");

    const result = await ensureOggOpus("/tmp/input.ogg");

    expect(result).toEqual({ path: "/tmp/input.ogg", cleanup: false });
    expect(runFfprobeMock).toHaveBeenCalledTimes(1);
    expect(readSingleCommandArgs(runFfprobeMock)).toEqual([
      "-v",
      "error",
      "-select_streams",
      "a:0",
      "-show_entries",
      "stream=codec_name,sample_rate",
      "-of",
      "csv=p=0",
      "/tmp/input.ogg",
    ]);
    expect(runFfmpegMock).not.toHaveBeenCalled();
  });

  it("re-encodes .ogg opus when sample rate is not 48kHz", async () => {
    runFfprobeMock.mockResolvedValueOnce("opus,24000\n");
    runFfmpegMock.mockImplementationOnce(async (...callArgs: unknown[]) => {
      const args = callArgs[0] as string[];
      const outputPath = args.at(-1);
      if (typeof outputPath !== "string") {
        throw new Error("missing ffmpeg output path");
      }
      await fs.writeFile(outputPath, "ogg");
    });

    const result = await ensureOggOpus("/tmp/input.ogg");

    expect(result.cleanup).toBe(true);
    expect(path.dirname(result.path)).toBe(path.normalize("/tmp"));
    expect(path.basename(result.path)).toMatch(/^voice-.*\.ogg$/);
    expect(runFfmpegMock).toHaveBeenCalledTimes(1);
    const ffmpegArgs = readSingleCommandArgs(runFfmpegMock);
    expect(ffmpegArgs.slice(0, -1)).toEqual([
      "-y",
      "-i",
      "/tmp/input.ogg",
      "-vn",
      "-sn",
      "-dn",
      "-t",
      "1200",
      "-ar",
      "48000",
      "-c:a",
      "libopus",
      "-b:a",
      "64k",
    ]);
    const ffmpegOutputPath = ffmpegArgs.at(-1);
    expectStagedFfmpegOutput(ffmpegOutputPath, result.path);
    await expect(fs.readFile(result.path, "utf8")).resolves.toBe("ogg");
  });

  it("re-encodes non-ogg input with bounded ffmpeg execution", async () => {
    runFfmpegMock.mockImplementationOnce(async (...callArgs: unknown[]) => {
      const args = callArgs[0] as string[];
      const outputPath = args.at(-1);
      if (typeof outputPath !== "string") {
        throw new Error("missing ffmpeg output path");
      }
      await fs.writeFile(outputPath, "ogg");
    });

    const result = await ensureOggOpus("/tmp/input.mp3");

    expect(result.cleanup).toBe(true);
    expect(runFfprobeMock).not.toHaveBeenCalled();
    expect(runFfmpegMock).toHaveBeenCalledTimes(1);
    const ffmpegArgs = readSingleCommandArgs(runFfmpegMock);
    expect(ffmpegArgs.slice(0, -1)).toEqual([
      "-y",
      "-i",
      "/tmp/input.mp3",
      "-vn",
      "-sn",
      "-dn",
      "-t",
      "1200",
      "-ar",
      "48000",
      "-c:a",
      "libopus",
      "-b:a",
      "64k",
    ]);
    const ffmpegOutputPath = ffmpegArgs.at(-1);
    expectStagedFfmpegOutput(ffmpegOutputPath, result.path);
    await expect(fs.readFile(result.path, "utf8")).resolves.toBe("ogg");
  });
});
