import * as SlackBolt from "@slack/bolt";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveSlackWebClientOptions } from "./client.js";

// Same CJS/ESM interop fallback as monitor/provider.ts, but off the namespace
// import: under vitest the default export of this CJS module carries no `App`.
const slackBoltModule = SlackBolt as typeof import("@slack/bolt") & {
  default?: typeof import("@slack/bolt");
};
const slackBolt =
  (slackBoltModule.App ? slackBoltModule : slackBoltModule.default) ?? slackBoltModule;
const { App } = slackBolt;

/**
 * Socket Mode proxy support is implicit: monitor/provider.ts only passes
 * `clientOptions` to bolt's `App`, and bolt itself carries the agent the rest of
 * the way — `App` merges `clientOptions` into `installerOptions`
 * (App.js: `installerOptions = { clientOptions: this.clientOptions, ...installerOptions }`),
 * SocketModeReceiver forwards `installerOptions.clientOptions` to SocketModeClient,
 * which hands `webClientOptions.agent` to SlackWebSocket as `httpAgent`, which `ws`
 * uses to tunnel the upgrade request.
 *
 * Nothing in this repo restates that chain, so a bolt upgrade that drops the merge
 * would silently return Slack Socket Mode to direct egress — the #2954 regression,
 * with Web API calls still correctly proxied and no other test failing. This pins
 * the bolt-side half of the contract at the last seam observable without a network
 * connection: the agent arriving on the SocketModeClient.
 */
const PROXY_ENV_KEYS = ["HTTPS_PROXY", "HTTP_PROXY", "https_proxy", "http_proxy"] as const;
const originalEnv = { ...process.env };

function readSocketModeAgent(app: unknown): unknown {
  // `receiver` (App) and `webClientOptions` (SocketModeClient) are both private;
  // reach through structurally rather than suppress the type error.
  const receiver = (app as { receiver?: { client?: unknown } }).receiver;
  const socketClient = receiver?.client as { webClientOptions?: { agent?: unknown } } | undefined;
  return socketClient?.webClientOptions?.agent;
}

function createSocketModeApp(clientOptions: ReturnType<typeof resolveSlackWebClientOptions>) {
  return new App({
    token: "xoxb-test",
    appToken: "xapp-test",
    socketMode: true,
    clientOptions,
    // Otherwise the constructor fires a live auth.test against slack.com.
    tokenVerificationEnabled: false,
  });
}

describe("slack socket mode proxy wiring", () => {
  beforeEach(() => {
    for (const key of PROXY_ENV_KEYS) {
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of PROXY_ENV_KEYS) {
      if (originalEnv[key] !== undefined) {
        process.env[key] = originalEnv[key];
      } else {
        delete process.env[key];
      }
    }
  });

  it("hands the env proxy agent to the Socket Mode client", () => {
    process.env.HTTPS_PROXY = "http://proxy.example.com:3128";
    const clientOptions = resolveSlackWebClientOptions();
    expect(clientOptions.agent).toBeDefined();

    const agent = readSocketModeAgent(createSocketModeApp(clientOptions));

    expect(agent).toBe(clientOptions.agent);
    expect((agent as { constructor: { name: string } }).constructor.name).toBe("HttpsProxyAgent");
  });

  it("leaves the Socket Mode client unproxied when no proxy is configured", () => {
    const clientOptions = resolveSlackWebClientOptions();
    expect(clientOptions.agent).toBeUndefined();

    expect(readSocketModeAgent(createSocketModeApp(clientOptions))).toBeUndefined();
  });

  it("leaves the Socket Mode client unproxied when NO_PROXY excludes Slack", () => {
    process.env.HTTPS_PROXY = "http://proxy.example.com:3128";
    process.env.NO_PROXY = "slack.com";
    try {
      const clientOptions = resolveSlackWebClientOptions();

      expect(readSocketModeAgent(createSocketModeApp(clientOptions))).toBeUndefined();
    } finally {
      delete process.env.NO_PROXY;
    }
  });
});
