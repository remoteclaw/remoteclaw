import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AUTH_STORE_VERSION } from "./constants.js";
import { ensureAuthProfileStore } from "./index.js";

describe("ensureAuthProfileStore", () => {
  let prevStateDir: string | undefined;
  let tempDir: string;

  afterEach(() => {
    if (prevStateDir === undefined) {
      delete process.env.REMOTECLAW_STATE_DIR;
    } else {
      process.env.REMOTECLAW_STATE_DIR = prevStateDir;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns an empty store when no auth-profiles.json exists", () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "remoteclaw-auth-empty-"));
    prevStateDir = process.env.REMOTECLAW_STATE_DIR;
    process.env.REMOTECLAW_STATE_DIR = tempDir;

    const store = ensureAuthProfileStore();
    expect(store.version).toBe(AUTH_STORE_VERSION);
    expect(Object.keys(store.profiles)).toHaveLength(0);
  });

  it("loads profiles from global auth-profiles.json", () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "remoteclaw-auth-global-"));
    prevStateDir = process.env.REMOTECLAW_STATE_DIR;
    process.env.REMOTECLAW_STATE_DIR = tempDir;

    const globalStore = {
      version: AUTH_STORE_VERSION,
      profiles: {
        "anthropic:default": {
          type: "api_key",
          provider: "anthropic",
          key: "sk-ant-global-key",
        },
      },
    };
    fs.writeFileSync(
      path.join(tempDir, "auth-profiles.json"),
      `${JSON.stringify(globalStore, null, 2)}\n`,
      "utf8",
    );

    const store = ensureAuthProfileStore();
    expect(store.profiles["anthropic:default"]).toMatchObject({
      type: "api_key",
      provider: "anthropic",
      key: "sk-ant-global-key",
    });
  });
});
