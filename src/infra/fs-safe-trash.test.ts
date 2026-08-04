// Covers containment and symlink handling for the subprocess-free trash move.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { captureEnv, setTestEnvValue } from "../test-utils/env.js";
import { movePathToTrash } from "./fs-safe-trash.js";

let homeDir: string;
let envSnapshot: ReturnType<typeof captureEnv>;

function trashEntries(): string[] {
  const dir =
    process.platform === "linux"
      ? path.join(homeDir, ".local", "share", "Trash", "files")
      : path.join(homeDir, ".Trash");
  return fs.existsSync(dir) ? fs.readdirSync(dir) : [];
}

// os.homedir() reads $HOME on POSIX, and resolveTrashDir() derives the trash
// directory from it, so pointing HOME at a temp dir keeps every move inside the
// fixture instead of the developer's real Trash.
beforeEach(() => {
  envSnapshot = captureEnv(["HOME", "XDG_DATA_HOME", "USERPROFILE"]);
  homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "remoteclaw-fs-safe-trash-"));
  setTestEnvValue("HOME", homeDir);
  setTestEnvValue("USERPROFILE", homeDir);
  setTestEnvValue("XDG_DATA_HOME", path.join(homeDir, ".local", "share"));
});

afterEach(() => {
  envSnapshot.restore();
  fs.rmSync(homeDir, { recursive: true, force: true });
});

describe("movePathToTrash", () => {
  it("moves a file into the trash directory and returns its destination", async () => {
    const workDir = path.join(homeDir, "work");
    const target = path.join(workDir, "remoteclaw.json");
    fs.mkdirSync(workDir, { recursive: true });
    fs.writeFileSync(target, "{}\n");

    const destination = await movePathToTrash(target, { allowedRoots: [workDir] });

    expect(fs.existsSync(target)).toBe(false);
    expect(fs.readFileSync(destination, "utf8")).toBe("{}\n");
    expect(trashEntries()).toHaveLength(1);
  });

  it("refuses a symlink whose target resolves outside every allowed root", async () => {
    const workDir = path.join(homeDir, "work");
    const outsideDir = path.join(homeDir, "outside");
    fs.mkdirSync(workDir, { recursive: true });
    fs.mkdirSync(outsideDir, { recursive: true });
    const outsideTarget = path.join(outsideDir, "payload.txt");
    fs.writeFileSync(outsideTarget, "do not touch\n");
    const link = path.join(workDir, "link");
    fs.symlinkSync(outsideTarget, link);

    // The link sits inside workDir, but the containment check follows it: only
    // a caller that also allows outsideDir may trash it.
    await expect(movePathToTrash(link, { allowedRoots: [workDir] })).rejects.toThrow(
      /outside the allowed roots/,
    );
    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
    expect(trashEntries()).toHaveLength(0);
  });

  it("refuses a target that resolves outside every allowed root", async () => {
    const workDir = path.join(homeDir, "work");
    const otherDir = path.join(homeDir, "other");
    const target = path.join(otherDir, "keep-me.json");
    fs.mkdirSync(workDir, { recursive: true });
    fs.mkdirSync(otherDir, { recursive: true });
    fs.writeFileSync(target, "keep\n");

    await expect(movePathToTrash(target, { allowedRoots: [workDir] })).rejects.toThrow(
      /outside the allowed roots/,
    );
    expect(fs.readFileSync(target, "utf8")).toBe("keep\n");
    expect(trashEntries()).toHaveLength(0);
  });

  it("canonicalizes a symlinked parent before the containment check", async () => {
    const realParent = path.join(homeDir, "state-real");
    const lexicalParent = path.join(homeDir, "state-link");
    fs.mkdirSync(realParent, { recursive: true });
    fs.symlinkSync(realParent, lexicalParent, "dir");
    const target = path.join(lexicalParent, "remoteclaw.json");
    fs.writeFileSync(target, "{}\n");

    // The root is the symlink, the resolved target is under the real parent:
    // both sides canonicalize, so this is contained rather than an escape.
    await movePathToTrash(target, { allowedRoots: [lexicalParent] });

    expect(fs.existsSync(path.join(realParent, "remoteclaw.json"))).toBe(false);
    expect(trashEntries()).toHaveLength(1);
  });

  it("trashes a symlink as a link without following it to its target", async () => {
    const workDir = path.join(homeDir, "work");
    const outsideDir = path.join(homeDir, "outside");
    fs.mkdirSync(workDir, { recursive: true });
    fs.mkdirSync(outsideDir, { recursive: true });
    const outsideTarget = path.join(outsideDir, "payload.txt");
    fs.writeFileSync(outsideTarget, "do not touch\n");
    const link = path.join(workDir, "link");
    fs.symlinkSync(outsideTarget, link);

    const destination = await movePathToTrash(link, {
      allowedRoots: [workDir, outsideDir],
    });

    expect(fs.lstatSync(destination).isSymbolicLink()).toBe(true);
    expect(fs.readFileSync(outsideTarget, "utf8")).toBe("do not touch\n");
    expect(fs.existsSync(link)).toBe(false);
  });

  it("skips the containment check when no allowed roots are given", async () => {
    const workDir = path.join(homeDir, "work");
    const target = path.join(workDir, "scratch.txt");
    fs.mkdirSync(workDir, { recursive: true });
    fs.writeFileSync(target, "scratch\n");

    await expect(movePathToTrash(target)).resolves.toContain("scratch.txt");
    expect(fs.existsSync(target)).toBe(false);
  });
});
