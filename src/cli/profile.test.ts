import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatCliCommand } from "./command-format.js";
import { applyCliProfileEnv, parseCliProfileArgs } from "./profile.js";

describe("parseCliProfileArgs", () => {
  it("leaves gateway --dev for subcommands", () => {
    const res = parseCliProfileArgs([
      "node",
      "remoteclaw",
      "gateway",
      "--dev",
      "--allow-unconfigured",
    ]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBeNull();
    expect(res.argv).toEqual(["node", "remoteclaw", "gateway", "--dev", "--allow-unconfigured"]);
  });

  it("still accepts global --dev before subcommand", () => {
    const res = parseCliProfileArgs(["node", "remoteclaw", "--dev", "gateway"]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("dev");
    expect(res.argv).toEqual(["node", "remoteclaw", "gateway"]);
  });

  it("parses --profile value and strips it", () => {
    const res = parseCliProfileArgs(["node", "remoteclaw", "--profile", "work", "status"]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("work");
    expect(res.argv).toEqual(["node", "remoteclaw", "status"]);
  });

  it("rejects missing profile value", () => {
    const res = parseCliProfileArgs(["node", "remoteclaw", "--profile"]);
    expect(res.ok).toBe(false);
  });

  it.each([
    ["--dev first", ["node", "remoteclaw", "--dev", "--profile", "work", "status"]],
    ["--profile first", ["node", "remoteclaw", "--profile", "work", "--dev", "status"]],
  ])("rejects combining --dev with --profile (%s)", (_name, argv) => {
    const res = parseCliProfileArgs(argv);
    expect(res.ok).toBe(false);
  });
});

describe("applyCliProfileEnv", () => {
  it("fills env defaults for dev profile", () => {
    const env: Record<string, string | undefined> = {};
    applyCliProfileEnv({
      profile: "dev",
      env,
      homedir: () => "/home/peter",
    });
    const expectedStateDir = path.join(path.resolve("/home/peter"), ".remoteclaw-dev");
    expect(env.REMOTECLAW_PROFILE).toBe("dev");
    expect(env.REMOTECLAW_STATE_DIR).toBe(expectedStateDir);
    expect(env.REMOTECLAW_CONFIG_PATH).toBe(path.join(expectedStateDir, "remoteclaw.json"));
    expect(env.REMOTECLAW_GATEWAY_PORT).toBe("19001");
  });

  it("does not override explicit env values", () => {
    const env: Record<string, string | undefined> = {
      REMOTECLAW_STATE_DIR: "/custom",
      REMOTECLAW_GATEWAY_PORT: "19099",
    };
    applyCliProfileEnv({
      profile: "dev",
      env,
      homedir: () => "/home/peter",
    });
    expect(env.REMOTECLAW_STATE_DIR).toBe("/custom");
    expect(env.REMOTECLAW_GATEWAY_PORT).toBe("19099");
    expect(env.REMOTECLAW_CONFIG_PATH).toBe(path.join("/custom", "remoteclaw.json"));
  });

  it("uses REMOTECLAW_HOME when deriving profile state dir", () => {
    const env: Record<string, string | undefined> = {
      REMOTECLAW_HOME: "/srv/remoteclaw-home",
      HOME: "/home/other",
    };
    applyCliProfileEnv({
      profile: "work",
      env,
      homedir: () => "/home/fallback",
    });

    const resolvedHome = path.resolve("/srv/remoteclaw-home");
    expect(env.REMOTECLAW_STATE_DIR).toBe(path.join(resolvedHome, ".remoteclaw-work"));
    expect(env.REMOTECLAW_CONFIG_PATH).toBe(
      path.join(resolvedHome, ".remoteclaw-work", "remoteclaw.json"),
    );
  });
});

describe("formatCliCommand", () => {
  it.each([
    {
      name: "no profile is set",
      cmd: "remoteclaw doctor --fix",
      env: {},
      expected: "remoteclaw doctor --fix",
    },
    {
      name: "profile is default",
      cmd: "remoteclaw doctor --fix",
      env: { REMOTECLAW_PROFILE: "default" },
      expected: "remoteclaw doctor --fix",
    },
    {
      name: "profile is Default (case-insensitive)",
      cmd: "remoteclaw doctor --fix",
      env: { REMOTECLAW_PROFILE: "Default" },
      expected: "remoteclaw doctor --fix",
    },
    {
      name: "profile is invalid",
      cmd: "remoteclaw doctor --fix",
      env: { REMOTECLAW_PROFILE: "bad profile" },
      expected: "remoteclaw doctor --fix",
    },
    {
      name: "--profile is already present",
      cmd: "remoteclaw --profile work doctor --fix",
      env: { REMOTECLAW_PROFILE: "work" },
      expected: "remoteclaw --profile work doctor --fix",
    },
    {
      name: "--dev is already present",
      cmd: "remoteclaw --dev doctor",
      env: { REMOTECLAW_PROFILE: "dev" },
      expected: "remoteclaw --dev doctor",
    },
  ])("returns command unchanged when $name", ({ cmd, env, expected }) => {
    expect(formatCliCommand(cmd, env)).toBe(expected);
  });

  it("inserts --profile flag when profile is set", () => {
    expect(formatCliCommand("remoteclaw doctor --fix", { REMOTECLAW_PROFILE: "work" })).toBe(
      "remoteclaw --profile work doctor --fix",
    );
  });

  it("trims whitespace from profile", () => {
    expect(
      formatCliCommand("remoteclaw doctor --fix", { REMOTECLAW_PROFILE: "  jbremoteclaw  " }),
    ).toBe("remoteclaw --profile jbremoteclaw doctor --fix");
  });

  it("handles command with no args after remoteclaw", () => {
    expect(formatCliCommand("remoteclaw", { REMOTECLAW_PROFILE: "test" })).toBe(
      "remoteclaw --profile test",
    );
  });

  it("handles pnpm wrapper", () => {
    expect(formatCliCommand("pnpm remoteclaw doctor", { REMOTECLAW_PROFILE: "work" })).toBe(
      "pnpm remoteclaw --profile work doctor",
    );
  });
});
