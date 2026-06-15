import { describe, expect, it } from "vitest";
import { getAccountConfig, listAccountIds } from "./config.js";

describe("getAccountConfig", () => {
  const mockMultiAccountConfig = {
    channels: {
      twitch: {
        accounts: {
          default: {
            username: "testbot",
            accessToken: "oauth:test123",
          },
          secondary: {
            username: "secondbot",
            accessToken: "oauth:secondary",
          },
        },
      },
    },
  };

  const mockSimplifiedConfig = {
    channels: {
      twitch: {
        username: "testbot",
        accessToken: "oauth:test123",
      },
    },
  };

  it("returns account config for valid account ID (multi-account)", () => {
    const result = getAccountConfig(mockMultiAccountConfig, "default");

    expect(result).not.toBeNull();
    expect(result?.username).toBe("testbot");
  });

  it("returns account config for default account (simplified config)", () => {
    const result = getAccountConfig(mockSimplifiedConfig, "default");

    expect(result).not.toBeNull();
    expect(result?.username).toBe("testbot");
  });

  it("returns non-default account from multi-account config", () => {
    const result = getAccountConfig(mockMultiAccountConfig, "secondary");

    expect(result).not.toBeNull();
    expect(result?.username).toBe("secondbot");
  });

  it("normalizes account ids without reading inherited account properties", () => {
    const accounts = Object.create({
      inherited: {
        username: "inherited-bot",
        accessToken: "oauth:inherited",
      },
    }) as Record<string, unknown>;
    accounts.Secondary = {
      username: "secondbot",
      accessToken: "oauth:secondary",
    };

    const cfg = {
      channels: {
        twitch: {
          accounts,
        },
      },
    };

    expect(getAccountConfig(cfg, "SECONDARY\r\n")).toMatchObject({ username: "secondbot" });
    expect(getAccountConfig(cfg, "inherited")).toBeNull();
  });

  it("returns null for non-existent account ID", () => {
    const result = getAccountConfig(mockMultiAccountConfig, "nonexistent");

    expect(result).toBeNull();
  });

  it("returns null when core config is null", () => {
    const result = getAccountConfig(null, "default");

    expect(result).toBeNull();
  });

  it("returns null when core config is undefined", () => {
    const result = getAccountConfig(undefined, "default");

    expect(result).toBeNull();
  });

  it("returns null when channels are not defined", () => {
    const result = getAccountConfig({}, "default");

    expect(result).toBeNull();
  });

  it("returns null when twitch is not defined", () => {
    const result = getAccountConfig({ channels: {} }, "default");

    expect(result).toBeNull();
  });

  it("returns null when accounts are not defined", () => {
    const result = getAccountConfig({ channels: { twitch: {} } }, "default");

    expect(result).toBeNull();
  });
});

describe("listAccountIds", () => {
  it("includes the implicit default account from simplified config", () => {
    expect(
      listAccountIds({
        channels: {
          twitch: {
            username: "testbot",
            accessToken: "oauth:test123",
          },
        },
      } as Parameters<typeof listAccountIds>[0]),
    ).toEqual(["default"]);
  });

  it("combines explicit accounts with the implicit default account once", () => {
    expect(
      listAccountIds({
        channels: {
          twitch: {
            username: "testbot",
            accounts: {
              default: { username: "testbot" },
              secondary: { username: "secondbot" },
            },
          },
        },
      } as Parameters<typeof listAccountIds>[0]),
    ).toEqual(["default", "secondary"]);
  });

  it("normalizes configured account ids", () => {
    expect(
      listAccountIds({
        channels: {
          twitch: {
            accounts: {
              Secondary: { username: "secondbot" },
              "Alerts\r\n\u001b[31m": { username: "alerts" },
            },
          },
        },
      } as Parameters<typeof listAccountIds>[0]),
    ).toEqual(["alerts-31m", "secondary"]);
  });
});
