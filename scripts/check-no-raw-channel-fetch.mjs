#!/usr/bin/env node

// Blocks new raw fetch callsites in channel and plugin runtime sources.
import ts from "typescript";
import { bundledPluginCallsite } from "./lib/bundled-plugin-paths.mjs";
import { runCallsiteGuard } from "./lib/callsite-guard.mjs";
import {
  collectCallExpressionLines,
  runAsScript,
  unwrapExpression,
} from "./lib/ts-guard-utils.mjs";

const sourceRoots = ["src/channels", "src/routing", "src/line", "extensions"];

// Allowlist ("ledger") of reviewed raw-fetch callsites in channel/plugin runtime code.
// New raw fetch callsites should be rejected and migrated to fetchWithSsrFGuard/shared
// channel helpers. Every entry carries a justification for WHY that specific callsite is
// not an SSRF vector — an entry without one is not reviewable and should not be added.
//
// Entries are pinned to `file:line` on purpose: when a callsite moves, the gate fails and
// the exception is re-reviewed rather than silently inherited. Fix drift by re-confirming
// the call is the same one and bumping the line — never by relaxing the matcher.
//
// Reconciled in #3055 against the live violation set. The gate had never been wired into
// CI, so the upstream-inherited ledger had rotted: 44 of 49 entries no longer matched any
// live call — 34 pointed at files gutted from the fork (28 distinct files), and 10 were
// stale line pins in 5 files that still exist (calls since migrated to fetchWithSsrFGuard,
// or moved). Those were removed: a line-pinned entry that matches nothing is a latent
// false-allow, since a future edit landing a raw fetch on that exact line would be admitted
// unreviewed. The safe/unsafe verdict for the entries this reconciliation added comes from
// an independent security-architect triage of all 19 then-current violations (0
// production-exploitable); the pre-existing entries it kept are the ones that still matched
// a live call.
//
// When writing a justification, name the control that actually restricts the request. Note
// that in SsrFPolicy (src/infra/net/ssrf.ts) `allowedHostnames` is NOT a restrictive
// allowlist — it EXEMPTS those hosts from the private-IP check
// (shouldSkipPrivateNetworkChecks), by exact match only. The restrictive field is
// `hostnameAllowlist`, and it alone interprets `*.` wildcard patterns.
const allowedRawFetchCallsites = new Set([
  // Shared `blueBubblesFetchWithTimeout` helper. Most callers
  // (chat/history/probe/reactions/send) pass a URL built by buildBlueBubblesApiUrl()
  // from the operator-supplied `baseUrl` of a self-hosted BlueBubbles server, and
  // multipart.ts forwards a URL its own callers supply. The one caller reachable by a
  // remote server is attachments.ts, which passes this helper as the `fetchImpl` to
  // fetchRemoteMedia() — so redirect targets chosen by the remote server also reach
  // this line. That path is protected by fetchWithSsrFGuard, which fetchRemoteMedia
  // always applies: DNS pinning, redirect:"manual" with per-hop re-validation, and
  // private-IP blocking. The `ssrfPolicy` attachments.ts passes only RELAXES that base
  // guard — `allowedHostnames: [trustedHostname]` exempts the operator's own host from
  // the private-IP check, `allowPrivateNetwork` is an explicit operator opt-in for a
  // LAN server, and a third branch passes no policy at all when the baseUrl has no
  // extractable hostname.
  bundledPluginCallsite("bluebubbles", "src/types.ts", 161),
  // Operator-supplied `baseUrl` for a self-hosted ClickClack deployment — local
  // config, never a value taken from inbound traffic (#2861).
  bundledPluginCallsite("clickclack", "src/http-client.ts", 52),
  // Discord gateway `fetchImpl`, used by @buape/carbon to reach the fixed Discord API
  // for gateway metadata. Two callsites: the no-proxy path and the invalid-proxy
  // fallback. No caller-controlled URL.
  bundledPluginCallsite("discord", "src/monitor/gateway-plugin.ts", 298),
  bundledPluginCallsite("discord", "src/monitor/gateway-plugin.ts", 332),
  // Fixed `https://discord.com/api/v10/webhooks/...` execution URL built by
  // resolveWebhookExecutionUrl(); id and token are encodeURIComponent'd into the path,
  // so neither can redirect the request to another host.
  bundledPluginCallsite("discord", "src/send.outbound.ts", 361),
  // Fixed CHAT_CERTS_URL constant on googleapis.com (Google Chat signing certs).
  bundledPluginCallsite("googlechat", "src/auth.ts", 83),
  // Operator-supplied `homeserver` from Matrix account config.
  bundledPluginCallsite("matrix", "src/directory-live.ts", 41),
  // Operator-supplied `baseUrl` for a self-hosted Mattermost server.
  bundledPluginCallsite("mattermost", "src/mattermost/probe.ts", 28),
  // Fixed Microsoft Graph root (`https://graph.microsoft.com/v1.0`); only the path
  // segment varies.
  bundledPluginCallsite("msteams", "src/graph.ts", 39),
  // Operator-supplied `baseUrl` for a self-hosted Nextcloud instance (message send and
  // reaction send).
  bundledPluginCallsite("nextcloud-talk", "src/send.ts", 104),
  bundledPluginCallsite("nextcloud-talk", "src/send.ts", 196),
  // QA test-harness bus; `baseUrl` is the local harness endpoint, not production input.
  bundledPluginCallsite("qa-channel", "src/bus-client.ts", 41),
  bundledPluginCallsite("qa-channel", "src/bus-client.ts", 221),
  // Inbound Slack media URL, but these two run *inside* the fetchImpl that
  // fetchRemoteMedia drives through fetchWithSsrFGuard — DNS pinning,
  // redirect:"manual" with per-hop re-validation, and private-IP blocking all apply.
  // The host restriction is assertSlackFileUrl(), which gates the FIRST hop (:63)
  // before the bot token is attached; hop 2+ (:67) deletes the Authorization header,
  // so a redirect target never receives the token. SLACK_MEDIA_SSRF_POLICY's
  // `allowedHostnames` is not the restriction — it is the private-IP-check exemption
  // described in the header note, and an inert one here, since that check is
  // exact-match while the policy supplies wildcards.
  bundledPluginCallsite("slack", "src/monitor/media.ts", 63),
  bundledPluginCallsite("slack", "src/monitor/media.ts", 67),
  // Fixed `https://api.elevenlabs.io/v1/voices`.
  bundledPluginCallsite("talk-voice", "index.ts", 31),
  // Fixed `https://memex.tlon.network` upload endpoint.
  bundledPluginCallsite("tlon", "src/tlon-api.ts", 184),
  // Blob PUT to the upload URL that the first-party Memex endpoint above just returned;
  // reached only on hosted ships that opted in, and the request carries no secret.
  bundledPluginCallsite("tlon", "src/tlon-api.ts", 234),
  // Blob PUT to a presigned URL derived from the operator's own configured S3 endpoint.
  bundledPluginCallsite("tlon", "src/tlon-api.ts", 288),
  // Fixed `https://api.openai.com/v1/audio/speech`.
  bundledPluginCallsite("voice-call", "src/providers/tts-openai.ts", 126),
  // Operator/provider-configured `baseUrl` for the Twilio REST API.
  bundledPluginCallsite("voice-call", "src/providers/twilio/api.ts", 23),

  // --- Non-bundled-plugin callsites (outside `extensions/`) ---
  // bundledPluginCallsite() only emits `extensions/…` keys, so repo-root channel
  // sources are spelled as raw `relPath:line` strings.
  // Fixed `https://api.telegram.org/bot<token>/getChat`; chatId is encodeURIComponent'd
  // into the query string.
  "src/channels/telegram/api.ts:8",
]);

function isRawFetchCall(expression) {
  const callee = unwrapExpression(expression);
  if (ts.isIdentifier(callee)) {
    return callee.text === "fetch";
  }
  if (ts.isPropertyAccessExpression(callee)) {
    return (
      ts.isIdentifier(callee.expression) &&
      callee.expression.text === "globalThis" &&
      callee.name.text === "fetch"
    );
  }
  return false;
}

/**
 * Finds raw `fetch(...)` and `globalThis.fetch(...)` call lines.
 */
export function findRawFetchCallLines(content, fileName = "source.ts") {
  const sourceFile = ts.createSourceFile(fileName, content, ts.ScriptTarget.Latest, true);
  return collectCallExpressionLines(ts, sourceFile, (node) =>
    isRawFetchCall(node.expression) ? node.expression : null,
  );
}

/**
 * Runs the raw channel/plugin fetch guard.
 */
export async function main() {
  await runCallsiteGuard({
    importMetaUrl: import.meta.url,
    sourceRoots,
    extraTestSuffixes: [".browser.test.ts", ".node.test.ts"],
    findCallLines: findRawFetchCallLines,
    skipRelativePath: (relPath) => relPath.includes("/test-support/"),
    allowCallsite: (callsite) => allowedRawFetchCallsites.has(callsite),
    header: "Found raw fetch() usage in channel/plugin runtime sources outside allowlist:",
    footer: "Use fetchWithSsrFGuard() or existing channel/plugin SDK wrappers for network calls.",
  });
}

runAsScript(import.meta.url, main);
