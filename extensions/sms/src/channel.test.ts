import { describe, expect, it } from "vitest";
import { listChannelPluginCatalogEntries } from "../../../src/channels/plugins/catalog.js";
import { smsPlugin } from "./channel.js";

describe("sms channel plugin", () => {
  it("loads the channel module and exposes the plugin identity", () => {
    // The import above is the real gate: a stale/gutted plugin-sdk subpath or a
    // non-exported specifier fails here with ERR_MODULE_NOT_FOUND, which a
    // typecheck-only pass (tsconfig `paths`) would not catch.
    expect(smsPlugin.id).toBe("sms");
    expect(smsPlugin.meta.id).toBe("sms");
    expect(smsPlugin.meta.label).toBe("SMS");
    expect(smsPlugin.meta.selectionLabel).toBe("SMS (Twilio)");
  });

  it("declares a text-only direct-message channel", () => {
    expect(smsPlugin.capabilities.chatTypes).toEqual(["direct"]);
    expect(smsPlugin.capabilities.media).toBe(false);
  });

  it("wires the config, security, messaging, outbound and status adapters", () => {
    expect(smsPlugin.configSchema).toBeDefined();
    expect(smsPlugin.reload?.configPrefixes).toEqual(["channels.sms"]);
    expect(typeof smsPlugin.config.listAccountIds).toBe("function");
    expect(typeof smsPlugin.config.resolveAccount).toBe("function");
    expect(typeof smsPlugin.security?.resolveDmPolicy).toBe("function");
    expect(typeof smsPlugin.messaging?.targetResolver?.looksLikeId).toBe("function");
    expect(smsPlugin.outbound?.deliveryMode).toBe("direct");
    expect(typeof smsPlugin.outbound?.sendText).toBe("function");
    expect(typeof smsPlugin.status?.probeAccount).toBe("function");
  });

  it("ships send-only: no gateway block until the inbound webhook lands (PR-4)", () => {
    expect(smsPlugin.gateway).toBeUndefined();
    expect(smsPlugin.gatewayMethods).toBeUndefined();
    // SMS is text-only; MMS/media sending is out of scope for this channel.
    expect(smsPlugin.outbound?.sendMedia).toBeUndefined();
  });

  it("normalizes and recognizes E.164 targets", () => {
    expect(smsPlugin.messaging?.normalizeTarget?.("+1 (555) 123-4567")).toBe("+15551234567");
    expect(smsPlugin.messaging?.normalizeTarget?.("   ")).toBeUndefined();
    expect(smsPlugin.messaging?.targetResolver?.looksLikeId?.("+15551234567")).toBe(true);
    expect(smsPlugin.messaging?.targetResolver?.looksLikeId?.("not-a-number")).toBe(false);
  });

  it("is discovered by the channel plugin catalog via manifest presence", () => {
    // Registration is presence-discovery: shipping package.json's
    // `remoteclaw.channel` block plus index.ts is what registers sms. No shared
    // production file lists it, so this asserts the discovery path really works.
    const entries = listChannelPluginCatalogEntries();
    const sms = entries.find((entry) => entry.id === "sms");
    expect(sms).toBeDefined();
    expect(sms?.meta.label).toBe("SMS");
    expect(sms?.meta.selectionLabel).toBe("SMS (Twilio)");
    expect(sms?.install.npmSpec).toBe("@remoteclaw/sms");
    // `pluginId` is resolved by loading this extension's remoteclaw.plugin.json.
    // It is the discriminating assertion: `id`/`meta` above are derived from
    // package.json's `remoteclaw.channel` (shipped in PR-2) and would pass
    // without this PR, whereas `pluginId` is undefined until the manifest lands.
    expect(sms?.pluginId).toBe("sms");
  });
});
