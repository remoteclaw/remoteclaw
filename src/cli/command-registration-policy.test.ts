import { describe, expect, it } from "vitest";
import {
  shouldEagerRegisterSubcommands,
  shouldRegisterPrimaryCommandOnly,
  shouldRegisterPrimarySubcommandOnly,
  shouldSkipPluginCommandRegistration,
} from "./command-registration-policy.js";

describe("command-registration-policy", () => {
  it("matches primary command registration policy", () => {
    expect(shouldRegisterPrimaryCommandOnly(["node", "remoteclaw", "status"])).toBe(true);
    expect(shouldRegisterPrimaryCommandOnly(["node", "remoteclaw", "status", "--help"])).toBe(
      false,
    );
    expect(shouldRegisterPrimaryCommandOnly(["node", "remoteclaw", "-V"])).toBe(false);
    expect(shouldRegisterPrimaryCommandOnly(["node", "remoteclaw", "acp", "-v"])).toBe(true);
  });

  it("matches plugin registration skip policy", () => {
    expect(
      shouldSkipPluginCommandRegistration({
        argv: ["node", "remoteclaw", "--help"],
        primary: null,
        hasBuiltinPrimary: false,
      }),
    ).toBe(true);
    expect(
      shouldSkipPluginCommandRegistration({
        argv: ["node", "remoteclaw", "config", "--help"],
        primary: "config",
        hasBuiltinPrimary: true,
      }),
    ).toBe(true);
    expect(
      shouldSkipPluginCommandRegistration({
        argv: ["node", "remoteclaw", "voicecall", "--help"],
        primary: "voicecall",
        hasBuiltinPrimary: false,
      }),
    ).toBe(false);
  });

  it("matches lazy subcommand registration policy", () => {
    expect(shouldEagerRegisterSubcommands({ REMOTECLAW_DISABLE_LAZY_SUBCOMMANDS: "1" })).toBe(true);
    expect(shouldEagerRegisterSubcommands({ REMOTECLAW_DISABLE_LAZY_SUBCOMMANDS: "0" })).toBe(
      false,
    );
    expect(shouldRegisterPrimarySubcommandOnly(["node", "remoteclaw", "acp"], {})).toBe(true);
    expect(shouldRegisterPrimarySubcommandOnly(["node", "remoteclaw", "acp", "--help"], {})).toBe(
      false,
    );
    expect(
      shouldRegisterPrimarySubcommandOnly(["node", "remoteclaw", "acp"], {
        REMOTECLAW_DISABLE_LAZY_SUBCOMMANDS: "1",
      }),
    ).toBe(false);
  });
});
