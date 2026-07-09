import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ChannelPluginCatalogEntry } from "../../channels/plugins/catalog.js";
import {
  hasTrustedGitWorkspace,
  isWithinBaseDirectory,
  resolveLocalPath,
} from "./plugin-install.js";

// resolveLocalPath / hasTrustedGitWorkspace hardening (issue #2838): realpath +
// containment + directory-only gate before an unscanned addPluginLoadPath, and a
// realpath + `.git` walk-up workspace-trust check (vs the prior bare existsSync).

function entryWithLocalPath(localPath: string | undefined): ChannelPluginCatalogEntry {
  // resolveLocalPath only reads entry.install.localPath — a minimal shape suffices.
  return { install: { localPath } } as unknown as ChannelPluginCatalogEntry;
}

let workspace: string;
let outside: string;

beforeEach(() => {
  workspace = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "rc-plugin-ws-")));
  outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "rc-plugin-out-")));
});

afterEach(() => {
  fs.rmSync(workspace, { recursive: true, force: true });
  fs.rmSync(outside, { recursive: true, force: true });
});

describe("isWithinBaseDirectory", () => {
  it("accepts the base itself and descendants", () => {
    expect(isWithinBaseDirectory("/base", "/base")).toBe(true);
    expect(isWithinBaseDirectory("/base", "/base/child")).toBe(true);
    expect(isWithinBaseDirectory("/base", "/base/a/b/c")).toBe(true);
  });

  it("rejects parents, siblings, and absolute escapes", () => {
    expect(isWithinBaseDirectory("/base", "/base/..")).toBe(false);
    expect(isWithinBaseDirectory("/base", "/base/../sibling")).toBe(false);
    expect(isWithinBaseDirectory("/base", "/elsewhere")).toBe(false);
    // A base whose name is a prefix of the target must not count as containing it.
    expect(isWithinBaseDirectory("/base", "/base-evil")).toBe(false);
  });
});

describe("resolveLocalPath", () => {
  it("returns null when local install is not allowed or no localPath is set", () => {
    fs.mkdirSync(path.join(workspace, "plugin"));
    expect(resolveLocalPath(entryWithLocalPath("plugin"), workspace, false)).toBeNull();
    expect(resolveLocalPath(entryWithLocalPath(undefined), workspace, true)).toBeNull();
    expect(resolveLocalPath(entryWithLocalPath("   "), workspace, true)).toBeNull();
  });

  it("resolves an in-workspace directory to its realpath", () => {
    const pluginDir = path.join(workspace, "plugin");
    fs.mkdirSync(pluginDir);
    expect(resolveLocalPath(entryWithLocalPath("plugin"), workspace, true)).toBe(
      fs.realpathSync(pluginDir),
    );
  });

  it("rejects a symlink whose target escapes the workspace", () => {
    // workspace/escape -> outside (a directory outside both workspace and cwd)
    fs.symlinkSync(outside, path.join(workspace, "escape"), "dir");
    expect(resolveLocalPath(entryWithLocalPath("escape"), workspace, true)).toBeNull();
  });

  it("rejects a `..` traversal that escapes the workspace base", () => {
    // Nest the workspace one level down so `../secret` escapes it but stays on disk.
    const nested = path.join(workspace, "ws");
    fs.mkdirSync(nested);
    fs.mkdirSync(path.join(workspace, "secret"));
    expect(resolveLocalPath(entryWithLocalPath("../secret"), nested, true)).toBeNull();
  });

  it("rejects an absolute path outside the trusted bases", () => {
    expect(resolveLocalPath(entryWithLocalPath(outside), workspace, true)).toBeNull();
  });

  it("rejects a file-valued localPath (directories only)", () => {
    fs.writeFileSync(path.join(workspace, "afile"), "x");
    expect(resolveLocalPath(entryWithLocalPath("afile"), workspace, true)).toBeNull();
  });

  it("returns null for a non-existent path (drives the npm fallback)", () => {
    expect(resolveLocalPath(entryWithLocalPath("does-not-exist"), workspace, true)).toBeNull();
  });
});

describe("hasTrustedGitWorkspace", () => {
  it("trusts a directory containing a .git directory", () => {
    fs.mkdirSync(path.join(workspace, ".git"));
    expect(hasTrustedGitWorkspace(workspace)).toBe(true);
  });

  it("trusts a descendant of a git workspace (walk-up)", () => {
    fs.mkdirSync(path.join(workspace, ".git"));
    const child = path.join(workspace, "a", "b");
    fs.mkdirSync(child, { recursive: true });
    expect(hasTrustedGitWorkspace(child)).toBe(true);
  });

  it("trusts a worktree/submodule .git gitdir-pointer file", () => {
    const gitDir = path.join(workspace, "realgit");
    fs.mkdirSync(gitDir);
    const wt = path.join(workspace, "wt");
    fs.mkdirSync(wt);
    fs.writeFileSync(path.join(wt, ".git"), `gitdir: ${gitDir}\n`);
    expect(hasTrustedGitWorkspace(wt)).toBe(true);
  });

  it("does not trust a directory with no .git in its ancestry", () => {
    // A fresh tmp dir under os.tmpdir() has no .git up to the filesystem root.
    expect(hasTrustedGitWorkspace(workspace)).toBe(false);
  });

  it("does not trust a non-existent path", () => {
    expect(hasTrustedGitWorkspace(path.join(workspace, "nope"))).toBe(false);
  });
});
