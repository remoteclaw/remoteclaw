// The roots that make `movePathToTrash`'s containment check able to reject: they
// come from the config/state resolvers, never from the path being trashed (#3102).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveOwnedStateRoots } from "./trash-roots.js";

const created: string[] = [];

function makeHome(): string {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "remoteclaw-trash-roots-"));
  created.push(home);
  return home;
}

afterEach(() => {
  while (created.length > 0) {
    fs.rmSync(created.pop() as string, { recursive: true, force: true });
  }
});

describe("resolveOwnedStateRoots", () => {
  it("returns the default state dir and both legacy dirs", () => {
    const home = makeHome();

    const roots = resolveOwnedStateRoots({ HOME: home, USERPROFILE: home });

    expect(roots).toEqual(
      expect.arrayContaining([
        path.join(home, ".remoteclaw"),
        path.join(home, ".clawdbot"),
        path.join(home, ".moldbot"),
      ]),
    );
  });

  it("honours REMOTECLAW_STATE_DIR", () => {
    const home = makeHome();
    const stateDir = path.join(home, "profiles", "work");
    fs.mkdirSync(stateDir, { recursive: true });

    const roots = resolveOwnedStateRoots({
      HOME: home,
      USERPROFILE: home,
      REMOTECLAW_STATE_DIR: stateDir,
    });

    expect(roots).toContain(stateDir);
  });

  it("honours REMOTECLAW_CONFIG_PATH by admitting its directory", () => {
    const home = makeHome();
    const configDir = path.join(home, "elsewhere");
    fs.mkdirSync(configDir, { recursive: true });

    const roots = resolveOwnedStateRoots({
      HOME: home,
      USERPROFILE: home,
      REMOTECLAW_CONFIG_PATH: path.join(configDir, "remoteclaw.json"),
    });

    expect(roots).toContain(configDir);
  });

  it("deduplicates when the config dir and state dir coincide", () => {
    const home = makeHome();
    const stateDir = path.join(home, "shared-state");
    fs.mkdirSync(stateDir, { recursive: true });

    const roots = resolveOwnedStateRoots({
      HOME: home,
      USERPROFILE: home,
      REMOTECLAW_STATE_DIR: stateDir,
    });

    expect(roots.filter((root) => root === stateDir)).toHaveLength(1);
  });

  it("never admits an arbitrary trash target's own directory", () => {
    const home = makeHome();
    const target = path.join(home, "outside", "victim");
    fs.mkdirSync(target, { recursive: true });

    const roots = resolveOwnedStateRoots({ HOME: home, USERPROFILE: home });

    // This is the whole point: the root set is a pure function of configuration,
    // so no target can arrange to be inside it just by existing somewhere.
    expect(roots).not.toContain(target);
    expect(roots).not.toContain(path.dirname(target));
  });
});
