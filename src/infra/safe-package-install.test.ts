// Covers script-free npm install args and environment.
import { describe, expect, it } from "vitest";
import { createSafeNpmInstallArgs, createSafeNpmInstallEnv } from "./safe-package-install.js";

describe("safe npm install helpers", () => {
  it("builds script-free npm install args", () => {
    expect(
      createSafeNpmInstallArgs({
        omitDev: true,
        omitPeer: true,
        legacyPeerDeps: true,
        ignoreWorkspaces: true,
        loglevel: "error",
        noAudit: true,
        noFund: true,
      }),
    ).toEqual([
      "install",
      "--omit=dev",
      "--omit=peer",
      "--legacy-peer-deps",
      "--loglevel=error",
      "--ignore-scripts",
      "--workspaces=false",
      "--no-audit",
      "--no-fund",
    ]);
  });

  it("forces project-local script-free npm install env", () => {
    expect(
      createSafeNpmInstallEnv(
        {
          PATH: "/usr/bin:/bin",
          NPM_CONFIG_IGNORE_SCRIPTS: "false",
          NPM_CONFIG_LEGACY_PEER_DEPS: "false",
          NPM_CONFIG_STRICT_PEER_DEPS: "true",
          npm_config_global: "true",
          npm_config_include_workspace_root: "true",
          npm_config_ignore_scripts: "false",
          npm_config_location: "global",
          npm_config_package_lock: "true",
          npm_config_workspace: "extensions/telegram",
          npm_config_workspaces: "true",
        },
        {
          cacheDir: "/tmp/remoteclaw-npm-cache",
          ignoreWorkspaces: true,
          legacyPeerDeps: true,
          packageLock: false,
          quiet: true,
        },
      ),
    ).toMatchObject({
      PATH: "/usr/bin:/bin",
      COREPACK_ENABLE_DOWNLOAD_PROMPT: "0",
      NPM_CONFIG_IGNORE_SCRIPTS: "true",
      npm_config_audit: "false",
      npm_config_cache: "/tmp/remoteclaw-npm-cache",
      npm_config_fund: "false",
      npm_config_global: "false",
      npm_config_ignore_scripts: "true",
      npm_config_legacy_peer_deps: "true",
      npm_config_location: "project",
      npm_config_loglevel: "error",
      npm_config_package_lock: "false",
      npm_config_progress: "false",
      npm_config_save: "false",
      npm_config_strict_peer_deps: "false",
      npm_config_workspaces: "false",
      npm_config_yes: "true",
    });
  });

  it("does not inherit host legacy peer dependency mode by default", () => {
    const env = createSafeNpmInstallEnv({
      PATH: "/usr/bin:/bin",
      npm_config_legacy_peer_deps: "true",
      npm_config_strict_peer_deps: "true",
    });

    expect(env.PATH).toBe("/usr/bin:/bin");
    expect(env.npm_config_legacy_peer_deps).toBe("false");
    expect(env.npm_config_strict_peer_deps).toBe("false");
  });

  it("allows package-lock-enabled installs to write lockfiles", () => {
    const env = createSafeNpmInstallEnv(
      {
        PATH: "/usr/bin:/bin",
        npm_config_save: "false",
      },
      {
        packageLock: true,
      },
    );

    expect(env.npm_config_package_lock).toBe("true");
    expect(env.npm_config_save).toBe("true");
  });
});
