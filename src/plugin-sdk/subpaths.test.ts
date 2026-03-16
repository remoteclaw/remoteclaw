import * as extensionApi from "openclaw/extension-api";
import * as compatSdk from "remoteclaw/plugin-sdk/compat";
import * as discordSdk from "remoteclaw/plugin-sdk/discord";
import * as imessageSdk from "remoteclaw/plugin-sdk/imessage";
import * as lineSdk from "remoteclaw/plugin-sdk/line";
import * as msteamsSdk from "remoteclaw/plugin-sdk/msteams";
import * as signalSdk from "remoteclaw/plugin-sdk/signal";
import * as slackSdk from "remoteclaw/plugin-sdk/slack";
import * as telegramSdk from "remoteclaw/plugin-sdk/telegram";
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
  { id: "googlechat", load: () => import("remoteclaw/plugin-sdk/googlechat") },
  { id: "irc", load: () => import("remoteclaw/plugin-sdk/irc") },
  { id: "llm-task", load: () => import("remoteclaw/plugin-sdk/llm-task") },
  { id: "lobster", load: () => import("remoteclaw/plugin-sdk/lobster") },
  { id: "matrix", load: () => import("remoteclaw/plugin-sdk/matrix") },
  { id: "mattermost", load: () => import("remoteclaw/plugin-sdk/mattermost") },
  { id: "memory-core", load: () => import("remoteclaw/plugin-sdk/memory-core") },
  { id: "memory-lancedb", load: () => import("remoteclaw/plugin-sdk/memory-lancedb") },
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
    expect(typeof discordSdk.inspectDiscordAccount).toBe("function");
    expect(typeof discordSdk.discordSetupWizard).toBe("object");
    expect(typeof discordSdk.discordSetupAdapter).toBe("object");
  });

  it("exports Slack helpers", () => {
    expect(typeof slackSdk.resolveSlackAccount).toBe("function");
    expect(typeof slackSdk.inspectSlackAccount).toBe("function");
    expect(typeof slackSdk.handleSlackMessageAction).toBe("function");
    expect(typeof slackSdk.slackSetupWizard).toBe("object");
    expect(typeof slackSdk.slackSetupAdapter).toBe("object");
  });

  it("exports Telegram helpers", () => {
    expect(typeof telegramSdk.resolveTelegramAccount).toBe("function");
    expect(typeof telegramSdk.inspectTelegramAccount).toBe("function");
    expect(typeof telegramSdk.telegramSetupWizard).toBe("object");
    expect(typeof telegramSdk.telegramSetupAdapter).toBe("object");
  });

  it("exports Signal helpers", () => {
    expect(typeof signalSdk.resolveSignalAccount).toBe("function");
    expect(typeof signalSdk.signalSetupWizard).toBe("object");
    expect(typeof signalSdk.signalSetupAdapter).toBe("object");
  });

  it("exports iMessage helpers", () => {
    expect(typeof imessageSdk.resolveIMessageAccount).toBe("function");
    expect(typeof imessageSdk.imessageSetupWizard).toBe("object");
    expect(typeof imessageSdk.imessageSetupAdapter).toBe("object");
  });

  it("exports IRC helpers", async () => {
    const ircSdk = await import("remoteclaw/plugin-sdk/irc");
    expect(typeof ircSdk.resolveIrcAccount).toBe("function");
    expect(typeof ircSdk.ircSetupWizard).toBe("object");
    expect(typeof ircSdk.ircSetupAdapter).toBe("object");
  });

  it("exports WhatsApp helpers", () => {
    // WhatsApp-specific functions (resolveWhatsAppAccount, whatsappOnboardingAdapter) moved to extensions/whatsapp/src/
    expect(typeof whatsappSdk.WhatsAppConfigSchema).toBe("object");
    expect(typeof whatsappSdk.resolveWhatsAppOutboundTarget).toBe("function");
    expect(typeof whatsappSdk.resolveWhatsAppMentionStripRegexes).toBe("function");
    expect("resolveWhatsAppMentionStripPatterns" in whatsappSdk).toBe(false);
  });

  it("exports Feishu helpers", async () => {
    const feishuSdk = await import("remoteclaw/plugin-sdk/feishu");
    expect(typeof feishuSdk.feishuSetupWizard).toBe("object");
    expect(typeof feishuSdk.feishuSetupAdapter).toBe("object");
  });

  it("exports LINE helpers", () => {
    expect(typeof lineSdk.processLineMessage).toBe("function");
    expect(typeof lineSdk.createInfoCard).toBe("function");
  });

  it("exports Microsoft Teams helpers", () => {
    expect(typeof msteamsSdk.resolveControlCommandGate).toBe("function");
    expect(typeof msteamsSdk.loadOutboundMediaFromUrl).toBe("function");
    expect(typeof msteamsSdk.msteamsSetupWizard).toBe("object");
    expect(typeof msteamsSdk.msteamsSetupAdapter).toBe("object");
  });

  it("exports Google Chat helpers", async () => {
    const googlechatSdk = await import("remoteclaw/plugin-sdk/googlechat");
    expect(typeof googlechatSdk.googlechatSetupWizard).toBe("object");
    expect(typeof googlechatSdk.googlechatSetupAdapter).toBe("object");
  });

  it("exports Zalo helpers", async () => {
    const zaloSdk = await import("remoteclaw/plugin-sdk/zalo");
    expect(typeof zaloSdk.zaloSetupWizard).toBe("object");
    expect(typeof zaloSdk.zaloSetupAdapter).toBe("object");
  });

  it("exports Zalouser helpers", async () => {
    const zalouserSdk = await import("remoteclaw/plugin-sdk/zalouser");
    expect(typeof zalouserSdk.zalouserSetupWizard).toBe("object");
    expect(typeof zalouserSdk.zalouserSetupAdapter).toBe("object");
  });

  it("exports Tlon helpers", async () => {
    const tlonSdk = await import("remoteclaw/plugin-sdk/tlon");
    expect(typeof tlonSdk.fetchWithSsrFGuard).toBe("function");
    expect(typeof tlonSdk.tlonSetupWizard).toBe("object");
    expect(typeof tlonSdk.tlonSetupAdapter).toBe("object");
  });

  it("exports acpx helpers", async () => {
    const acpxSdk = await import("remoteclaw/plugin-sdk/acpx");
    expect(typeof acpxSdk.listKnownProviderAuthEnvVarNames).toBe("function");
    expect(typeof acpxSdk.omitEnvKeysCaseInsensitive).toBe("function");
  });

  it("resolves bundled extension subpaths", async () => {
    for (const { id, load } of bundledExtensionSubpathLoaders) {
      const mod = await load();
      expect(typeof mod).toBe("object");
      expect(mod, `subpath ${id} should resolve`).toBeTruthy();
    }
  });

  it("keeps the newly added bundled plugin-sdk contracts available", async () => {
    const bluebubbles = await import("remoteclaw/plugin-sdk/bluebubbles");
    expect(typeof bluebubbles.parseFiniteNumber).toBe("function");

    const matrix = await import("remoteclaw/plugin-sdk/matrix");
    expect(typeof matrix.matrixSetupWizard).toBe("object");
    expect(typeof matrix.matrixSetupAdapter).toBe("object");

    const mattermost = await import("remoteclaw/plugin-sdk/mattermost");
    expect(typeof mattermost.parseStrictPositiveInteger).toBe("function");

    const nextcloudTalk = await import("remoteclaw/plugin-sdk/nextcloud-talk");
    expect(typeof nextcloudTalk.waitForAbortSignal).toBe("function");

    const twitch = await import("remoteclaw/plugin-sdk/twitch");
    expect(typeof twitch.DEFAULT_ACCOUNT_ID).toBe("string");
    expect(typeof twitch.normalizeAccountId).toBe("function");
    expect(typeof twitch.twitchSetupWizard).toBe("object");
    expect(typeof twitch.twitchSetupAdapter).toBe("object");

    const zalo = await import("remoteclaw/plugin-sdk/zalo");
    expect(typeof zalo.resolveClientIp).toBe("function");
  });

  it("exports the extension api bridge", () => {
    expect(typeof extensionApi.runEmbeddedPiAgent).toBe("function");
  });
});
