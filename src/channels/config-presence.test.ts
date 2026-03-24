import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { hasPotentialConfiguredChannels } from "./config-presence.js";

const tempDirs: string[] = [];

function makeTempStateDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "remoteclaw-channel-config-presence-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("config presence", () => {
  it("detects configured channels from config keys", () => {
    const stateDir = makeTempStateDir();
    const env = { REMOTECLAW_STATE_DIR: stateDir } as NodeJS.ProcessEnv;

    expect(hasPotentialConfiguredChannels({ channels: { slack: { botToken: "x" } } }, env)).toBe(
      true,
    );
    expect(hasPotentialConfiguredChannels({}, env)).toBe(false);
  });
});
