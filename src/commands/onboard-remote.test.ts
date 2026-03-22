import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RemoteClawConfig } from "../config/config.js";
import type { GatewayBonjourBeacon } from "../infra/bonjour-discovery.js";
import { captureEnv } from "../test-utils/env.js";
import type { WizardPrompter } from "../wizard/prompts.js";
import { createWizardPrompter } from "./test-wizard-helpers.js";

const discoverGatewayBeacons = vi.hoisted(() => vi.fn<() => Promise<GatewayBonjourBeacon[]>>());
const resolveWideAreaDiscoveryDomain = vi.hoisted(() => vi.fn(() => undefined));
const detectBinary = vi.hoisted(() => vi.fn<(name: string) => Promise<boolean>>());

vi.mock("../infra/bonjour-discovery.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../infra/bonjour-discovery.js")>();
  return {
    ...actual,
    discoverGatewayBeacons,
  };
});

vi.mock("../infra/widearea-dns.js", () => ({
  resolveWideAreaDiscoveryDomain,
}));

vi.mock("./onboard-helpers.js", () => ({
  detectBinary,
}));

const { promptRemoteGatewayConfig } = await import("./onboard-remote.js");

function createPrompter(overrides: Partial<WizardPrompter>): WizardPrompter {
  return createWizardPrompter(overrides, { defaultSelect: "" });
}

function createSelectPrompter(
  responses: Partial<Record<string, string>>,
): WizardPrompter["select"] {
  return vi.fn(async (params) => {
    const value = responses[params.message];
    if (value !== undefined) {
      return value as never;
    }
    return (params.options[0]?.value ?? "") as never;
  });
}

describe("promptRemoteGatewayConfig", () => {
  const envSnapshot = captureEnv(["REMOTECLAW_ALLOW_INSECURE_PRIVATE_WS"]);

  beforeEach(() => {
    vi.clearAllMocks();
    envSnapshot.restore();
    delete process.env.OPENCLAW_ALLOW_INSECURE_PRIVATE_WS;
    detectBinary.mockResolvedValue(false);
    discoverGatewayBeacons.mockResolvedValue([]);
    resolveWideAreaDiscoveryDomain.mockReturnValue(undefined);
  });

  afterEach(() => {
    envSnapshot.restore();
    delete process.env.OPENCLAW_ALLOW_INSECURE_PRIVATE_WS;
  });

  it("defaults discovered direct remote URLs to wss://", async () => {
    detectBinary.mockResolvedValue(true);
    discoverGatewayBeacons.mockResolvedValue([
      {
        instanceName: "gateway",
        displayName: "Gateway",
        host: "gateway.tailnet.ts.net",
        port: 18789,
      },
    ]);

    const select = createSelectPrompter({
      "Select gateway": "0",
      "Connection method": "direct",
      "Gateway auth": "token",
    });

    const text: WizardPrompter["text"] = vi.fn(async (params) => {
      if (params.message === "Gateway WebSocket URL") {
        expect(params.initialValue).toBe("wss://gateway.tailnet.ts.net:18789");
        expect(params.validate?.(String(params.initialValue))).toBeUndefined();
        return String(params.initialValue);
      }
      if (params.message === "Gateway token") {
        return "token-123";
      }
      return "";
    }) as WizardPrompter["text"];

    const cfg = {} as RemoteClawConfig;
    const prompter = createPrompter({
      confirm: vi.fn(async () => true),
      select,
      text,
    });

    const next = await promptRemoteGatewayConfig(cfg, prompter);

    expect(next.gateway?.mode).toBe("remote");
    expect(next.gateway?.remote?.url).toBe("wss://gateway.tailnet.ts.net:18789");
    expect(next.gateway?.remote?.token).toBe("token-123");
    expect(prompter.note).toHaveBeenCalledWith(
      expect.stringContaining("Direct remote access defaults to TLS."),
      "Direct remote",
    );
  });

  it("does not route from TXT-only discovery metadata", async () => {
    detectBinary.mockResolvedValue(true);
    discoverGatewayBeacons.mockResolvedValue([
      {
        instanceName: "gateway",
        displayName: "Gateway",
        lanHost: "attacker.example.com",
        tailnetDns: "attacker.tailnet.ts.net",
        gatewayPort: 19443,
        sshPort: 2222,
      },
    ]);

    const select: WizardPrompter["select"] = vi.fn(async (params) => {
      if (params.message === "Select gateway") {
        return "0" as never;
      }
      if (params.message === "Gateway auth") {
        return "off" as never;
      }
      return (params.options[0]?.value ?? "") as never;
    });
    const text: WizardPrompter["text"] = vi.fn(async (params) => {
      if (params.message === "Gateway WebSocket URL") {
        expect(params.initialValue).toBe("ws://127.0.0.1:18789");
        return String(params.initialValue);
      }
      return "";
    }) as WizardPrompter["text"];
    const prompter = createPrompter({
      confirm: vi.fn(async () => true),
      select,
      text,
    });

    const next = await promptRemoteGatewayConfig({} as OpenClawConfig, prompter);

    expect(next.gateway?.remote?.url).toBe("ws://127.0.0.1:18789");
    expect(select).not.toHaveBeenCalledWith(
      expect.objectContaining({ message: "Connection method" }),
    );
  });

  it("validates insecure ws:// remote URLs and allows only loopback ws:// by default", async () => {
    const text: WizardPrompter["text"] = vi.fn(async (params) => {
      if (params.message === "Gateway WebSocket URL") {
        // ws:// to public IPs is rejected
        expect(params.validate?.("ws://203.0.113.10:18789")).toContain("Use wss://");
        // ws:// to private IPs remains blocked by default
        expect(params.validate?.("ws://10.0.0.8:18789")).toContain("Use wss://");
        expect(params.validate?.("ws://127.0.0.1:18789")).toBeUndefined();
        expect(params.validate?.("wss://remote.example.com:18789")).toBeUndefined();
        return "wss://remote.example.com:18789";
      }
      return "";
    }) as WizardPrompter["text"];

    const select = createSelectPrompter({ "Gateway auth": "off" });

    const cfg = {} as RemoteClawConfig;
    const prompter = createPrompter({
      confirm: vi.fn(async () => false),
      select,
      text,
    });

    const next = await promptRemoteGatewayConfig(cfg, prompter);
    expect(next.gateway?.mode).toBe("remote");
    expect(next.gateway?.remote?.url).toBe("wss://remote.example.com:18789");
    expect(next.gateway?.remote?.token).toBeUndefined();
  });

  it("allows ws:// hostname remote URLs when REMOTECLAW_ALLOW_INSECURE_PRIVATE_WS=1", async () => {
    process.env.REMOTECLAW_ALLOW_INSECURE_PRIVATE_WS = "1";
    const text: WizardPrompter["text"] = vi.fn(async (params) => {
      if (params.message === "Gateway WebSocket URL") {
        expect(params.validate?.("ws://remoteclaw-gateway.ai:18789")).toBeUndefined();
        expect(params.validate?.("ws://1.1.1.1:18789")).toContain("Use wss://");
        return "ws://remoteclaw-gateway.ai:18789";
      }
      return "";
    }) as WizardPrompter["text"];

    const select = createSelectPrompter({ "Gateway auth": "off" });

    const cfg = {} as RemoteClawConfig;
    const prompter = createPrompter({
      confirm: vi.fn(async () => false),
      select,
      text,
    });

    const next = await promptRemoteGatewayConfig(cfg, prompter);
    expect(next.gateway?.mode).toBe("remote");
    expect(next.gateway?.remote?.url).toBe("ws://remoteclaw-gateway.ai:18789");
  });

  it("supports storing remote auth as an external env secret ref", async () => {
    process.env.REMOTECLAW_GATEWAY_TOKEN = "remote-token-value";
    const text: WizardPrompter["text"] = vi.fn(async (params) => {
      if (params.message === "Gateway WebSocket URL") {
        return "wss://remote.example.com:18789";
      }
      if (params.message === "Environment variable name") {
        return "REMOTECLAW_GATEWAY_TOKEN";
      }
      return "";
    }) as WizardPrompter["text"];

    const select: WizardPrompter["select"] = vi.fn(async (params) => {
      if (params.message === "Gateway auth") {
        return "token" as never;
      }
      if (params.message === "How do you want to provide this gateway token?") {
        return "ref" as never;
      }
      if (params.message === "Where is this gateway token stored?") {
        return "env" as never;
      }
      return (params.options[0]?.value ?? "") as never;
    });

    const cfg = {} as RemoteClawConfig;
    const prompter = createPrompter({
      confirm: vi.fn(async () => false),
      select,
      text,
    });

    const next = await promptRemoteGatewayConfig(cfg, prompter);

    expect(next.gateway?.mode).toBe("remote");
    expect(next.gateway?.remote?.url).toBe("wss://remote.example.com:18789");
    expect(next.gateway?.remote?.token).toBeUndefined();
  });

  it("allows private ws:// only when REMOTECLAW_ALLOW_INSECURE_PRIVATE_WS=1", async () => {
    process.env.REMOTECLAW_ALLOW_INSECURE_PRIVATE_WS = "1";

    const text: WizardPrompter["text"] = vi.fn(async (params) => {
      if (params.message === "Gateway WebSocket URL") {
        expect(params.validate?.("ws://10.0.0.8:18789")).toBeUndefined();
        return "ws://10.0.0.8:18789";
      }
      return "";
    }) as WizardPrompter["text"];

    const select = createSelectPrompter({ "Gateway auth": "off" });

    const cfg = {} as RemoteClawConfig;
    const prompter = createPrompter({
      confirm: vi.fn(async () => false),
      select,
      text,
    });

    const next = await promptRemoteGatewayConfig(cfg, prompter);

    expect(next.gateway?.remote?.url).toBe("ws://10.0.0.8:18789");
  });
});
