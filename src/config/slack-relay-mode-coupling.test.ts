// Coupling tripwire for remoteclaw#3078 — Slack relay transport vs. its config validation.
//
// The v2026.6.11 sync landed the Slack relay TRANSPORT
// (extensions/slack/src/monitor/relay-source.ts) but not the relay CONFIG SCHEMA
// upstream uses to validate it (SlackRelaySchema + requireRelayConfig).
//
// Today that split is fail-closed and correct: the Slack `mode` enum excludes
// "relay" and the schema is .strict(), so the transport is unreachable from
// config and nothing needs fixing. This file exists to keep it that way.
//
// THE INVARIANT PINNED HERE:
//
//   Either `mode` excludes "relay", OR the schema defines relay validation
//   (SlackRelaySchema + requireRelayConfig enforced on BOTH the top-level and
//   the per-account path). Never one without the other.
//
// Why the second half matters: relay-source.ts feeds config straight into
// `new URL(config.url)` and an `Authorization: Bearer ${authToken}` header with
// no local validation. Upstream's requireRelayConfig is what rejects a blank
// relay.url / missing relay.authToken, and its SlackRelaySchema is what marks
// authToken as a sensitive SecretInputSchema so secret redaction covers it.
// Widening the enum without porting those turns config into an unvalidated
// outbound-credential path.
//
// IF YOU ARE HERE BECAUSE THIS FILE WENT RED: you most likely widened the Slack
// `mode` enum. That is allowed — but only together with the validation. Port
// SlackRelaySchema and requireRelayConfig from upstream, enforce requireRelayConfig
// at BOTH the top-level and per-account paths, then update the expectations below
// to the new intended shape. Please do not simply delete this file: the coupling
// assertion at the bottom is the only thing standing between a widened enum and
// an unvalidated credential-bearing connection path.
//
// Ref: https://github.com/remoteclaw/remoteclaw/issues/3078
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateConfigObject } from "./config.js";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const SCHEMA_RELATIVE_PATH = "src/config/zod-schema.providers-core.ts";

const WHY = [
  "remoteclaw#3078: the Slack relay transport (extensions/slack/src/monitor/relay-source.ts)",
  "is present in this fork, but the relay config validation (SlackRelaySchema +",
  "requireRelayConfig) is not. The narrow `mode` enum is what keeps the transport",
  "unreachable. Widening it without porting the validation exposes an unvalidated",
  "relay.url / relay.authToken path. See the header comment in this file.",
].join(" ");

function issuesFor(raw: unknown) {
  const res = validateConfigObject(raw);
  return res.ok ? undefined : res.issues;
}

describe("Slack relay mode/validation coupling (remoteclaw#3078)", () => {
  it("accepts mode=socket — control for the rejections below", () => {
    // Without this control, the two rejection tests could pass for an unrelated
    // reason (some other required Slack field) and silently stop guarding relay.
    const res = validateConfigObject({ channels: { slack: { mode: "socket" } } });
    expect(res.ok).toBe(true);
  });

  it('rejects channels.slack.mode="relay" (top-level enum)', () => {
    const issues = issuesFor({ channels: { slack: { mode: "relay" } } });
    expect(issues, WHY).toBeDefined();

    const modeIssue = issues?.find((issue) => issue.path === "channels.slack.mode");
    expect(modeIssue, WHY).toBeDefined();
    expect(modeIssue?.allowedValues, WHY).toBeDefined();
    expect(modeIssue?.allowedValues, WHY).not.toContain("relay");
  });

  it('rejects channels.slack.accounts.*.mode="relay" (per-account enum)', () => {
    const issues = issuesFor({ channels: { slack: { accounts: { ops: { mode: "relay" } } } } });
    expect(issues, WHY).toBeDefined();

    const modeIssue = issues?.find((issue) => issue.path === "channels.slack.accounts.ops.mode");
    expect(modeIssue, WHY).toBeDefined();
    expect(modeIssue?.allowedValues, WHY).toBeDefined();
    expect(modeIssue?.allowedValues, WHY).not.toContain("relay");
  });

  it("rejects an unknown channels.slack.relay config block (strict schema)", () => {
    // The second independent gate documented in #3078: even with a widened enum,
    // .strict() rejects the `relay` object the transport would read.
    const issues = issuesFor({
      channels: {
        slack: { relay: { url: "wss://relay.example", authToken: "t", gatewayId: "g" } },
      },
    });
    expect(issues, WHY).toBeDefined();
    expect(
      issues?.some((issue) => issue.message.includes("relay")),
      WHY,
    ).toBe(true);
  });

  it("never lets a relay-mode config through without relay validation", () => {
    // The tripwire proper. Unlike the cases above, this assertion stays correct
    // across a legitimate future widening: it fails ONLY for the dangerous
    // combination (relay mode accepted, relay validation absent).
    const relayModeAccepted = validateConfigObject({
      channels: { slack: { mode: "relay" } },
    }).ok;

    const schemaSource = fs.readFileSync(path.join(repoRoot, SCHEMA_RELATIVE_PATH), "utf8");
    const definesRelaySchema = /\bSlackRelaySchema\b/.test(schemaSource);
    // Call sites only — the lookbehind drops the `function requireRelayConfig(`
    // declaration so this counts enforcement, not definition. Upstream enforces
    // it twice: once top-level, once per-account.
    const relayEnforcementCallSites = (
      schemaSource.match(/(?<!\bfunction\s)\brequireRelayConfig\s*\(/g) ?? []
    ).length;

    const relayValidationPresent = definesRelaySchema && relayEnforcementCallSites >= 2;
    const invariantHolds = !relayModeAccepted || relayValidationPresent;

    expect(
      invariantHolds,
      [
        `Slack relay coupling broken in ${SCHEMA_RELATIVE_PATH}.`,
        `relayModeAccepted=${relayModeAccepted}`,
        `definesSlackRelaySchema=${definesRelaySchema}`,
        `requireRelayConfigCallSites=${relayEnforcementCallSites} (need >= 2)`,
        "",
        "A relay-mode Slack config now validates, but the schema does not validate",
        "the relay block itself. relay.url reaches new URL() and relay.authToken",
        "reaches an Authorization: Bearer header unchecked, and authToken is not",
        "registered as sensitive so secret redaction does not cover it.",
        "",
        "Fix by porting SlackRelaySchema + requireRelayConfig from upstream and",
        "enforcing requireRelayConfig on both the top-level and per-account paths.",
        "",
        WHY,
      ].join("\n"),
    ).toBe(true);
  });
});
