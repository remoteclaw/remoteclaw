import { describe, expect, it } from "vitest";
import type { MattermostRegisteredCommand } from "./slash-commands.js";
import {
  activateSlashCommands,
  deactivateSlashCommands,
  resolveSlashHandlerForToken,
} from "./slash-state.js";

function registered(
  token: string,
  overrides: Partial<MattermostRegisteredCommand> = {},
): MattermostRegisteredCommand {
  return {
    id: `cmd-${token}`,
    trigger: "oc_status",
    teamId: "t1",
    token,
    url: "https://chat.example.com/callback",
    managed: true,
    ...overrides,
  };
}

describe("slash-state token routing", () => {
  it("returns single match when token belongs to one account", () => {
    deactivateSlashCommands();
    activateSlashCommands({
      account: { accountId: "a1" } as any,
      registeredCommands: [registered("tok-a")],
      api: { cfg: {} as any, runtime: {} as any },
    });

    const match = resolveSlashHandlerForToken("tok-a");
    expect(match.kind).toBe("single");
    expect(match.accountIds).toEqual(["a1"]);
  });

  it("returns ambiguous when same token exists in multiple accounts", () => {
    deactivateSlashCommands();
    activateSlashCommands({
      account: { accountId: "a1" } as any,
      registeredCommands: [registered("tok-shared", { id: "c1", teamId: "t1" })],
      api: { cfg: {} as any, runtime: {} as any },
    });
    activateSlashCommands({
      account: { accountId: "a2" } as any,
      registeredCommands: [registered("tok-shared", { id: "c2", teamId: "t2" })],
      api: { cfg: {} as any, runtime: {} as any },
    });

    const match = resolveSlashHandlerForToken("tok-shared");
    expect(match.kind).toBe("ambiguous");
    expect(match.accountIds?.toSorted()).toEqual(["a1", "a2"]);
  });
});
