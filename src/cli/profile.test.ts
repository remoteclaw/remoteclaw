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

  it("rejects combining --dev with --profile (dev first)", () => {
    const res = parseCliProfileArgs(["node", "remoteclaw", "--dev", "--profile", "work", "status"]);
    expect(res.ok).toBe(false);
  });

  it("rejects combining --dev with --profile (profile first)", () => {
    const res = parseCliProfileArgs(["node", "remoteclaw", "--profile", "work", "--dev", "status"]);
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
  it("returns command unchanged when no profile is set", () => {
    expect(formatCliCommand("remoteclaw doctor --fix", {})).toBe("remoteclaw doctor --fix");
  });

  it("returns command unchanged when profile is default", () => {
    expect(formatCliCommand("remoteclaw doctor --fix", { REMOTECLAW_PROFILE: "default" })).toBe(
      "remoteclaw doctor --fix",
    );
  });

  it("returns command unchanged when profile is Default (case-insensitive)", () => {
    expect(formatCliCommand("remoteclaw doctor --fix", { REMOTECLAW_PROFILE: "Default" })).toBe(
      "remoteclaw doctor --fix",
    );
  });

  it("returns command unchanged when profile is invalid", () => {
    expect(formatCliCommand("remoteclaw doctor --fix", { REMOTECLAW_PROFILE: "bad profile" })).toBe(
      "remoteclaw doctor --fix",
    );
  });

  it("returns command unchanged when --profile is already present", () => {
    expect(
      formatCliCommand("remoteclaw --profile work doctor --fix", { REMOTECLAW_PROFILE: "work" }),
    ).toBe("remoteclaw --profile work doctor --fix");
  });

  it("returns command unchanged when --dev is already present", () => {
    expect(formatCliCommand("remoteclaw --dev doctor", { REMOTECLAW_PROFILE: "dev" })).toBe(
      "remoteclaw --dev doctor",
    );
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
