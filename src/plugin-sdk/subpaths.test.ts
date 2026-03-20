import * as compatSdk from "remoteclaw/plugin-sdk/compat";
import * as discordSdk from "remoteclaw/plugin-sdk/discord";
import * as imessageSdk from "remoteclaw/plugin-sdk/imessage";
import * as lineSdk from "remoteclaw/plugin-sdk/line";
import * as msteamsSdk from "remoteclaw/plugin-sdk/msteams";
import * as signalSdk from "remoteclaw/plugin-sdk/signal";
import * as slackSdk from "remoteclaw/plugin-sdk/slack";
import * as whatsappSdk from "remoteclaw/plugin-sdk/whatsapp";
import { describe, expect, it } from "vitest";

const bundledExtensionSubpathLoaders = [
  { id: "acpx", load: () => import("remoteclaw/plugin-sdk/acpx") },
  { id: "bluebubbles", load: () => import("remoteclaw/plugin-sdk/bluebubbles") },
  { id: "copilot-proxy", load: () => import("remoteclaw/plugin-sdk/copilot-proxy") },
  { id: "device-pair", load: () => import("remoteclaw/plugin-sdk/device-pair") },
  { id: "diagnostics-otel", load: () => import("remoteclaw/plugin-sdk/diagnostics-otel") },
  { id: "diffs", load: () => import("remoteclaw/plugin-sdk/diffs") },
  { id: "feishu", load: () => import("remoteclaw/plugin-sdk/feishu") },
  {
    id: "google-gemini-cli-auth",
    load: () => import("remoteclaw/plugin-sdk/google-gemini-cli-auth"),
  },
  { id: "googlechat", load: () => import("remoteclaw/plugin-sdk/googlechat") },
  { id: "irc", load: () => import("remoteclaw/plugin-sdk/irc") },
  { id: "llm-task", load: () => import("remoteclaw/plugin-sdk/llm-task") },
  { id: "lobster", load: () => import("remoteclaw/plugin-sdk/lobster") },
  { id: "matrix", load: () => import("remoteclaw/plugin-sdk/matrix") },
  { id: "mattermost", load: () => import("remoteclaw/plugin-sdk/mattermost") },
  {
    id: "minimax-portal-auth",
    load: () => import("remoteclaw/plugin-sdk/minimax-portal-auth"),
  },
  { id: "nextcloud-talk", load: () => import("remoteclaw/plugin-sdk/nextcloud-talk") },
  { id: "nostr", load: () => import("remoteclaw/plugin-sdk/nostr") },
  { id: "open-prose", load: () => import("remoteclaw/plugin-sdk/open-prose") },
  { id: "phone-control", load: () => import("remoteclaw/plugin-sdk/phone-control") },
  { id: "qwen-portal-auth", load: () => import("remoteclaw/plugin-sdk/qwen-portal-auth") },
  { id: "synology-chat", load: () => import("remoteclaw/plugin-sdk/synology-chat") },
  { id: "talk-voice", load: () => import("remoteclaw/plugin-sdk/talk-voice") },
  { id: "test-utils", load: () => import("remoteclaw/plugin-sdk/test-utils") },
  { id: "thread-ownership", load: () => import("remoteclaw/plugin-sdk/thread-ownership") },
  { id: "tlon", load: () => import("remoteclaw/plugin-sdk/tlon") },
  { id: "twitch", load: () => import("remoteclaw/plugin-sdk/twitch") },
  { id: "voice-call", load: () => import("remoteclaw/plugin-sdk/voice-call") },
  { id: "zalo", load: () => import("remoteclaw/plugin-sdk/zalo") },
  { id: "zalouser", load: () => import("remoteclaw/plugin-sdk/zalouser") },
] as const;

describe("plugin-sdk subpath exports", () => {
  it("exports compat helpers", () => {
    expect(typeof compatSdk.emptyPluginConfigSchema).toBe("function");
    expect(typeof compatSdk.resolveControlCommandGate).toBe("function");
  });

  it("exports Discord helpers", () => {
    expect(typeof discordSdk.resolveDiscordAccount).toBe("function");
    expect(typeof discordSdk.discordOnboardingAdapter).toBe("object");
  });

  it("exports Slack helpers", () => {
    expect(typeof slackSdk.resolveSlackAccount).toBe("function");
    expect(typeof slackSdk.handleSlackMessageAction).toBe("function");
  });

  it("exports Signal helpers", () => {
    expect(typeof signalSdk.resolveSignalAccount).toBe("function");
    expect(typeof signalSdk.signalOnboardingAdapter).toBe("object");
  });

  it("exports iMessage helpers", () => {
    expect(typeof imessageSdk.resolveIMessageAccount).toBe("function");
    expect(typeof imessageSdk.imessageOnboardingAdapter).toBe("object");
  });

  it("exports WhatsApp helpers", () => {
    expect(typeof whatsappSdk.resolveWhatsAppAccount).toBe("function");
    expect(typeof whatsappSdk.whatsappOnboardingAdapter).toBe("object");
  });

  it("exports LINE helpers", () => {
    expect(typeof lineSdk.processLineMessage).toBe("function");
    expect(typeof lineSdk.createInfoCard).toBe("function");
  });

  it("exports Microsoft Teams helpers", () => {
    expect(typeof msteamsSdk.resolveControlCommandGate).toBe("function");
    expect(typeof msteamsSdk.loadOutboundMediaFromUrl).toBe("function");
  });

  it("resolves bundled extension subpaths", async () => {
    for (const { id, load } of bundledExtensionSubpathLoaders) {
      const mod = await load();
      expect(typeof mod).toBe("object");
      expect(mod, `subpath ${id} should resolve`).toBeTruthy();
    }
  });
});
