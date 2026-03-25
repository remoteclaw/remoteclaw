import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  expandHomePrefix,
  resolveEffectiveHomeDir,
  resolveHomeRelativePath,
  resolveOsHomeDir,
  resolveOsHomeRelativePath,
  resolveRequiredHomeDir,
} from "./home-dir.js";

describe("resolveEffectiveHomeDir", () => {
  it.each([
    {
      name: "prefers REMOTECLAW_HOME over HOME and USERPROFILE",
      env: {
        REMOTECLAW_HOME: " /srv/remoteclaw-home ",
        HOME: "/home/other",
        USERPROFILE: "C:/Users/other",
      } as NodeJS.ProcessEnv,
      homedir: () => "/fallback",
      expected: "/srv/remoteclaw-home",
    },
    {
      name: "falls back to HOME",
      env: { HOME: " /home/alice " } as NodeJS.ProcessEnv,
      expected: "/home/alice",
    },
    {
      name: "falls back to USERPROFILE when HOME is blank",
      env: {
        HOME: "   ",
        USERPROFILE: " C:/Users/alice ",
      } as NodeJS.ProcessEnv,
      expected: "C:/Users/alice",
    },
    {
      name: "falls back to homedir when env values are blank",
      env: {
        REMOTECLAW_HOME: " ",
        HOME: " ",
        USERPROFILE: "\t",
      } as NodeJS.ProcessEnv,
      homedir: () => " /fallback ",
      expected: "/fallback",
    },
  ])("$name", ({ env, homedir, expected }) => {
    expect(resolveEffectiveHomeDir(env, homedir)).toBe(path.resolve(expected));
  });

  it.each([
    {
      name: "expands ~/ using HOME",
      env: {
        REMOTECLAW_HOME: "~/svc",
        HOME: "/home/alice",
      } as NodeJS.ProcessEnv,
      expected: "/home/alice/svc",
    },
    {
      name: "expands ~\\\\ using USERPROFILE",
      env: {
        REMOTECLAW_HOME: "~\\svc",
        HOME: " ",
        USERPROFILE: "C:/Users/alice",
      } as NodeJS.ProcessEnv,
      expected: "C:/Users/alice\\svc",
    },
  ])("$name", ({ env, expected }) => {
    expect(resolveEffectiveHomeDir(env)).toBe(path.resolve(expected));
  });
});

describe("resolveRequiredHomeDir", () => {
  it("returns cwd when no home source is available", () => {
    expect(
      resolveRequiredHomeDir({} as NodeJS.ProcessEnv, () => {
        throw new Error("no home");
      }),
    ).toBe(process.cwd());
  });

  it("returns a fully resolved path for REMOTECLAW_HOME", () => {
    const result = resolveRequiredHomeDir(
      { REMOTECLAW_HOME: "/custom/home" } as NodeJS.ProcessEnv,
      () => "/fallback",
    );
    expect(result).toBe(path.resolve("/custom/home"));
  });

  it("returns cwd when REMOTECLAW_HOME is tilde-only and no fallback home exists", () => {
    expect(
      resolveRequiredHomeDir({ REMOTECLAW_HOME: "~" } as NodeJS.ProcessEnv, () => {
        throw new Error("no home");
      }),
    ).toBe(process.cwd());
  });
});

describe("resolveOsHomeDir", () => {
  it("ignores REMOTECLAW_HOME and uses HOME", () => {
    expect(
      resolveOsHomeDir(
        {
          REMOTECLAW_HOME: "/srv/remoteclaw-home",
          HOME: "/home/alice",
          USERPROFILE: "C:/Users/alice",
        } as NodeJS.ProcessEnv,
        () => "/fallback",
      ),
    ).toBe(path.resolve("/home/alice"));
  });
});

describe("expandHomePrefix", () => {
  it.each([
    {
      name: "expands ~/ using effective home",
      input: "~/x",
      opts: {
        env: { REMOTECLAW_HOME: "/srv/remoteclaw-home" } as NodeJS.ProcessEnv,
      },
      expected: `${path.resolve("/srv/remoteclaw-home")}/x`,
    },
    {
      name: "expands exact ~ using explicit home",
      input: "~",
      opts: { home: " /srv/remoteclaw-home " },
      expected: "/srv/remoteclaw-home",
    },
    {
      name: "expands ~\\\\ using resolved env home",
      input: "~\\x",
      opts: {
        env: { HOME: "/home/alice" } as NodeJS.ProcessEnv,
      },
      expected: `${path.resolve("/home/alice")}\\x`,
    },
    {
      name: "keeps non-tilde values unchanged",
      input: "/tmp/x",
      expected: "/tmp/x",
    },
  ])("$name", ({ input, opts, expected }) => {
    expect(expandHomePrefix(input, opts)).toBe(expected);
  });
});

describe("resolveHomeRelativePath", () => {
  it("returns blank input unchanged", () => {
    expect(resolveHomeRelativePath("   ")).toBe("");
  });

  it("resolves trimmed relative and absolute paths", () => {
    expect(resolveHomeRelativePath(" ./tmp/file.txt ")).toBe(path.resolve("./tmp/file.txt"));
    expect(resolveHomeRelativePath(" /tmp/file.txt ")).toBe(path.resolve("/tmp/file.txt"));
  });

  it("expands tilde paths using the resolved home directory", () => {
    expect(
      resolveHomeRelativePath("~/docs", {
        env: { REMOTECLAW_HOME: "/srv/remoteclaw-home" } as NodeJS.ProcessEnv,
      }),
    ).toBe(path.resolve("/srv/remoteclaw-home/docs"));
  });

  it("falls back to cwd when tilde paths have no home source", () => {
    expect(
      resolveHomeRelativePath("~", {
        env: {} as NodeJS.ProcessEnv,
        homedir: () => {
          throw new Error("no home");
        },
      }),
    ).toBe(path.resolve(process.cwd()));
  });
});

describe("resolveOsHomeRelativePath", () => {
  it("expands tilde paths using the OS home instead of REMOTECLAW_HOME", () => {
    expect(
      resolveOsHomeRelativePath("~/docs", {
        env: {
          REMOTECLAW_HOME: "/srv/remoteclaw-home",
          HOME: "/home/alice",
        } as NodeJS.ProcessEnv,
      }),
    ).toBe(path.resolve("/home/alice/docs"));
  });
});
