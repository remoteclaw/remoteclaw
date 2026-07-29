// Clickclack tests cover the ingress admission contract this adapter must keep.
//
// These are the two conformance points #2861 calls out for the channel-ingress
// surface, asserted against the REAL `resolveStableChannelMessageIngress` gate
// (nothing in the message-access path is mocked here):
//
//  1. The DM/group admission policies are hardcoded to `"allowlist"`. An
//     unlisted sender is refused in direct conversations AND in channels, and
//     open-policy config on the channel section must not widen that.
//  2. `shouldDispatch` derives from `ingress.admission === "dispatch"`, and
//     admission is decided ahead of command authorization — a refused sender
//     never becomes dispatchable by virtue of the command gate.
//
// A third point, added for #3054, closes the gap those two left open. Point 1
// pins the admission MODE; it says nothing about the LIST that mode consults.
// `allowFrom` is that list, and it now defaults to `[]`:
//
//  3. An account the operator never configured refuses EVERY sender, rather
//     than admitting the whole workspace. Point 1 therefore holds for the
//     SHIPPED DEFAULT, not merely for a fixture that happens to carry a list.
//     Deliberate fork divergence from upstream OpenClaw, which defaults
//     `["*"]` (open).
import {
  type PluginRuntime,
  resolveStableChannelMessageIngress,
} from "remoteclaw/plugin-sdk/clickclack";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPluginRuntimeMock } from "../../test-utils/plugin-runtime-mock.js";
import { resolveClickClackInboundAccess } from "./access.js";
import { resolveClickClackAccount } from "./accounts.js";
import { setClickClackRuntime } from "./runtime.js";
import type { ClickClackMessage, CoreConfig, ResolvedClickClackAccount } from "./types.js";

// Spy on the ingress gate WITHOUT replacing it: every test in this file still
// exercises the real `resolveStableChannelMessageIngress`. The spy exists so the
// policy literals the adapter passes can be asserted at the seam, not only
// through their outcome — see the "pins the policy literals" test below for why
// outcome-only assertions are not enough for the DM half.
vi.mock("remoteclaw/plugin-sdk/clickclack", async (importOriginal) => {
  const actual = await importOriginal<typeof import("remoteclaw/plugin-sdk/clickclack")>();
  return {
    ...actual,
    resolveStableChannelMessageIngress: vi.fn(actual.resolveStableChannelMessageIngress),
  };
});

function createRuntime(params: { commandRequested: boolean }): PluginRuntime {
  const runtime = createPluginRuntimeMock() as PluginRuntime;
  vi.mocked(runtime.channel.commands.shouldComputeCommandAuthorized).mockReturnValue(
    params.commandRequested,
  );
  return runtime;
}

function createAccount(
  overrides: Partial<ResolvedClickClackAccount> = {},
): ResolvedClickClackAccount {
  return {
    accountId: "default",
    enabled: true,
    configured: true,
    baseUrl: "http://127.0.0.1:8080",
    token: "ccb_default",
    workspace: "wsp_1",
    defaultTo: "channel:general",
    allowFrom: ["usr_owner"],
    reconnectMs: 1_500,
    config: { allowFrom: ["usr_owner"] },
    ...overrides,
  };
}

function groupMessage(authorId: string): ClickClackMessage {
  return {
    id: "msg_1",
    workspace_id: "wsp_1",
    channel_id: "chn_1",
    author_id: authorId,
    thread_root_id: "msg_1",
    body: "/fast on",
    body_format: "markdown",
    created_at: "2026-05-09T12:00:00.000Z",
  };
}

function directMessage(authorId: string): ClickClackMessage {
  return {
    id: "msg_2",
    workspace_id: "wsp_1",
    direct_conversation_id: "dcn_1",
    author_id: authorId,
    thread_root_id: "msg_2",
    body: "/fast on",
    body_format: "markdown",
    created_at: "2026-05-09T12:00:00.000Z",
  };
}

const bareConfig = {} satisfies CoreConfig;

describe("ClickClack ingress admission (hardcoded allowlist policy)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("admits an allowlisted sender in a channel", async () => {
    setClickClackRuntime(createRuntime({ commandRequested: false }));

    const access = await resolveClickClackInboundAccess({
      account: createAccount(),
      config: bareConfig,
      message: groupMessage("usr_owner"),
    });

    expect(access.shouldDispatch).toBe(true);
  });

  it("admits an allowlisted sender in a direct conversation", async () => {
    setClickClackRuntime(createRuntime({ commandRequested: false }));

    const access = await resolveClickClackInboundAccess({
      account: createAccount(),
      config: bareConfig,
      message: directMessage("usr_owner"),
    });

    expect(access.shouldDispatch).toBe(true);
  });

  it("refuses an unlisted sender in a channel (groupPolicy stays allowlist)", async () => {
    setClickClackRuntime(createRuntime({ commandRequested: false }));

    const access = await resolveClickClackInboundAccess({
      account: createAccount(),
      config: bareConfig,
      message: groupMessage("usr_attacker"),
    });

    expect(access.shouldDispatch).toBe(false);
  });

  it("refuses an unlisted sender in a direct conversation (dmPolicy stays allowlist)", async () => {
    setClickClackRuntime(createRuntime({ commandRequested: false }));

    const access = await resolveClickClackInboundAccess({
      account: createAccount(),
      config: bareConfig,
      message: directMessage("usr_attacker"),
    });

    expect(access.shouldDispatch).toBe(false);
  });

  it("does not let open dm/group policy config widen the hardcoded allowlist", async () => {
    // The adapter passes literal `dmPolicy: "allowlist"` / `groupPolicy: "allowlist"`
    // rather than reading them from config, so an operator (or a config-write
    // path) cannot flip this channel to an open admission policy.
    setClickClackRuntime(createRuntime({ commandRequested: false }));
    const openConfig = {
      channels: {
        clickclack: {
          dmPolicy: "open",
          groupPolicy: "open",
        },
      },
    } as unknown as CoreConfig;

    const direct = await resolveClickClackInboundAccess({
      account: createAccount(),
      config: openConfig,
      message: directMessage("usr_attacker"),
    });
    const group = await resolveClickClackInboundAccess({
      account: createAccount(),
      config: openConfig,
      message: groupMessage("usr_attacker"),
    });

    expect(direct.shouldDispatch).toBe(false);
    expect(group.shouldDispatch).toBe(false);
  });

  it("pins the policy literals handed to the ingress gate, not just their outcome", async () => {
    // Outcome-only assertions do NOT discriminate the DM half of conformance
    // point 1: absent a pairing store, `dmPolicy: "open"` and `"pairing"` both
    // produce the same allow/refuse results as `"allowlist"` for these inputs,
    // so a widening mutation would slip through green. Assert the literals the
    // adapter actually hands the gate instead — that fails on any widening.
    setClickClackRuntime(createRuntime({ commandRequested: false }));
    const spy = vi.mocked(resolveStableChannelMessageIngress);

    await resolveClickClackInboundAccess({
      account: createAccount(),
      config: bareConfig,
      message: directMessage("usr_owner"),
    });
    await resolveClickClackInboundAccess({
      account: createAccount(),
      config: bareConfig,
      message: groupMessage("usr_owner"),
    });

    expect(spy).toHaveBeenCalledTimes(2);
    for (const [params] of spy.mock.calls) {
      expect(params.dmPolicy).toBe("allowlist");
      expect(params.groupPolicy).toBe("allowlist");
    }
  });

  it("records the allowlist policy on the resolved sender gate for both kinds", async () => {
    // Second, independent read of the same invariant: the gate graph the engine
    // produced must report `sender.policy === "allowlist"`. This catches a
    // widening that happened INSIDE the gate rather than at the call site.
    setClickClackRuntime(createRuntime({ commandRequested: false }));
    const spy = vi.mocked(resolveStableChannelMessageIngress);

    for (const message of [directMessage("usr_owner"), groupMessage("usr_owner")]) {
      await resolveClickClackInboundAccess({
        account: createAccount(),
        config: bareConfig,
        message,
      });
      const resolved = await spy.mock.results.at(-1)?.value;
      const senderGates = resolved.ingress.graph.gates.filter(
        (gate: { sender?: { policy?: string } }) => gate.sender,
      );
      expect(senderGates.length).toBeGreaterThan(0);
      for (const gate of senderGates) {
        expect(gate.sender.policy).toBe("allowlist");
      }
    }
  });

  it("refuses every sender for an account with no configured allowFrom (fail-closed default)", async () => {
    // The SHIPPED default, exercised end-to-end. Every other case in this file
    // hands `resolveClickClackInboundAccess` a hand-built `createAccount()`
    // fixture carrying an explicit list, so the value `accounts.ts` actually
    // resolves never reached the admission path — which is exactly how an open
    // `["*"]` default sat under a green suite until #3054. Build the account
    // through the real normalization instead, and assert the consequence.
    setClickClackRuntime(createRuntime({ commandRequested: false }));
    const cfg = {
      channels: {
        clickclack: {
          enabled: true,
          baseUrl: "https://app.clickclack.chat",
          token: "ccb_default",
          workspace: "wsp_1",
        },
      },
    } satisfies CoreConfig;
    const account = resolveClickClackAccount({ cfg });

    // Asserted here as well as in accounts.test.ts so a revert to `["*"]`
    // reports as "the default changed" rather than "the gate stopped working".
    expect(account.allowFrom).toEqual([]);

    const direct = await resolveClickClackInboundAccess({
      account,
      config: cfg,
      message: directMessage("usr_anyone"),
    });
    const group = await resolveClickClackInboundAccess({
      account,
      config: cfg,
      message: groupMessage("usr_anyone"),
    });

    expect(direct.shouldDispatch).toBe(false);
    expect(group.shouldDispatch).toBe(false);
  });

  it("keeps a wildcard allowFrom entry working for both conversation kinds", async () => {
    // An operator who writes `["*"]` explicitly still opts into open admission.
    // The fail-closed default is about the ABSENT-config case, not about
    // removing the wildcard, so this stays valid behavior.
    setClickClackRuntime(createRuntime({ commandRequested: false }));
    const account = createAccount({ allowFrom: ["*"], config: { allowFrom: ["*"] } });

    const direct = await resolveClickClackInboundAccess({
      account,
      config: bareConfig,
      message: directMessage("usr_anyone"),
    });
    const group = await resolveClickClackInboundAccess({
      account,
      config: bareConfig,
      message: groupMessage("usr_anyone"),
    });

    expect(direct.shouldDispatch).toBe(true);
    expect(group.shouldDispatch).toBe(true);
  });
});

describe("ClickClack ingress admission ordering vs command authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuses dispatch for an unlisted sender even when a command gate is requested", async () => {
    // Admission is resolved from `ingress.admission`, independently of the
    // command gate: requesting command authorization must not become a second
    // path into the pipeline for a sender the allowlist already refused.
    setClickClackRuntime(createRuntime({ commandRequested: true }));

    const access = await resolveClickClackInboundAccess({
      account: createAccount(),
      config: bareConfig,
      message: groupMessage("usr_attacker"),
    });

    expect(access.shouldDispatch).toBe(false);
    expect(access.commandAuthorized).toBe(false);
  });

  it("authorizes commands for an allowlisted sender once admitted", async () => {
    setClickClackRuntime(createRuntime({ commandRequested: true }));

    const access = await resolveClickClackInboundAccess({
      account: createAccount(),
      config: bareConfig,
      message: groupMessage("usr_owner"),
    });

    expect(access.shouldDispatch).toBe(true);
    expect(access.commandAuthorized).toBe(true);
  });

  it("falls back to sender access for commandAuthorized when no command gate is requested", async () => {
    setClickClackRuntime(createRuntime({ commandRequested: false }));

    const allowed = await resolveClickClackInboundAccess({
      account: createAccount(),
      config: bareConfig,
      message: groupMessage("usr_owner"),
    });
    const refused = await resolveClickClackInboundAccess({
      account: createAccount(),
      config: bareConfig,
      message: groupMessage("usr_attacker"),
    });

    expect(allowed.commandAuthorized).toBe(true);
    expect(refused.commandAuthorized).toBe(false);
  });

  it("normalizes provider-prefixed and dm-prefixed allowlist entries to the same user id", async () => {
    // The identity normalizer strips `clickclack:` / `cc:` / `dm:` prefixes.
    // A loose normalizer here would be an allowlist bypass vector, so pin the
    // accepted spellings and confirm a near-miss is still refused.
    setClickClackRuntime(createRuntime({ commandRequested: false }));

    for (const entry of ["usr_owner", "clickclack:usr_owner", "cc:usr_owner", "dm:usr_owner"]) {
      const access = await resolveClickClackInboundAccess({
        account: createAccount({ allowFrom: [entry], config: { allowFrom: [entry] } }),
        config: bareConfig,
        message: directMessage("usr_owner"),
      });
      expect(access.shouldDispatch, `entry ${entry} should admit usr_owner`).toBe(true);
    }

    const nearMiss = await resolveClickClackInboundAccess({
      account: createAccount({ allowFrom: ["usr_owner2"], config: { allowFrom: ["usr_owner2"] } }),
      config: bareConfig,
      message: directMessage("usr_owner"),
    });
    expect(nearMiss.shouldDispatch).toBe(false);
  });
});
