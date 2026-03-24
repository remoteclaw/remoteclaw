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
  it("ignores enabled-only matrix config when listing configured channels", () => {
    const stateDir = makeTempStateDir();
    const env = { REMOTECLAW_STATE_DIR: stateDir } as NodeJS.ProcessEnv;
    const cfg = { channels: { matrix: { enabled: false } } };

    expect(hasPotentialConfiguredChannels(cfg, env)).toBe(false);
  });
});
