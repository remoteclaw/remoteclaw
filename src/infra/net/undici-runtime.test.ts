import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  _resetActiveManagedProxyStateForTests,
  registerActiveManagedProxyUrl,
} from "./proxy/active-proxy-state.js";
import { createHttp1EnvHttpProxyAgent, createHttp1ProxyAgent } from "./undici-runtime.js";

// The real `undici-runtime.ts` runs against injected fake dispatcher constructors so we
// can assert the exact options each helper hands to undici (mirrors the injection pattern
// used by extensions/discord/src/monitor/provider.rest-proxy.test.ts).
const TEST_UNDICI_RUNTIME_DEPS_KEY = "__REMOTECLAW_TEST_UNDICI_RUNTIME_DEPS__";
const MANAGED_PROXY_URL = "https://managed.example:8443";

const proxyAgentOptions: Array<Record<string, unknown>> = [];
const envHttpProxyAgentOptions: Array<Record<string, unknown>> = [];

function installUndiciRuntimeDeps(): void {
  class Agent {
    constructor(readonly options?: unknown) {}
  }
  class EnvHttpProxyAgent {
    constructor(readonly options?: unknown) {
      envHttpProxyAgentOptions.push((options ?? {}) as Record<string, unknown>);
    }
  }
  class ProxyAgent {
    constructor(readonly options: unknown) {
      proxyAgentOptions.push((options ?? {}) as Record<string, unknown>);
    }
  }
  (globalThis as Record<string, unknown>)[TEST_UNDICI_RUNTIME_DEPS_KEY] = {
    Agent,
    EnvHttpProxyAgent,
    ProxyAgent,
    fetch: vi.fn(),
  };
}

function asRecord(value: unknown, field: string): Record<string, unknown> {
  if (value === undefined || value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`expected ${field} to be an object`);
  }
  return value as Record<string, unknown>;
}

// `withHttp1OnlyDispatcherOptions` may seed `proxyTls` with autoSelectFamily keys even when
// no managed CA applies, so read `ca` defensively instead of asserting on the whole object.
function caOf(options: Record<string, unknown> | undefined): unknown {
  const proxyTls = options?.proxyTls;
  return proxyTls && typeof proxyTls === "object"
    ? (proxyTls as Record<string, unknown>).ca
    : undefined;
}

describe("undici-runtime managed proxy CA trust (#2984)", () => {
  const envKeys = [
    "http_proxy",
    "https_proxy",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "REMOTECLAW_PROXY_ACTIVE",
    "REMOTECLAW_PROXY_CA_FILE",
  ] as const;

  beforeEach(() => {
    _resetActiveManagedProxyStateForTests();
    for (const key of envKeys) {
      vi.stubEnv(key, "");
    }
    proxyAgentOptions.length = 0;
    envHttpProxyAgentOptions.length = 0;
    installUndiciRuntimeDeps();
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis as object, TEST_UNDICI_RUNTIME_DEPS_KEY);
    _resetActiveManagedProxyStateForTests();
    vi.unstubAllEnvs();
  });

  function registerManagedProxy(ca: string): void {
    vi.stubEnv("REMOTECLAW_PROXY_ACTIVE", "1");
    registerActiveManagedProxyUrl(new URL(MANAGED_PROXY_URL), {
      loopbackMode: "gateway-only",
      proxyTls: { ca },
    });
  }

  it("populates proxyTls.ca for an explicit proxy URI matching the active managed proxy", () => {
    registerManagedProxy("managed-proxy-ca");

    createHttp1ProxyAgent({ uri: MANAGED_PROXY_URL });

    const options = proxyAgentOptions.at(0);
    expect(caOf(options)).toBe("managed-proxy-ca");
    expect(options?.allowH2).toBe(false);
  });

  it("populates proxyTls.ca for the managed env proxy", () => {
    registerManagedProxy("managed-env-proxy-ca");

    createHttp1EnvHttpProxyAgent({ httpsProxy: MANAGED_PROXY_URL });

    const options = envHttpProxyAgentOptions.at(0);
    expect(caOf(options)).toBe("managed-env-proxy-ca");
    expect(options?.allowH2).toBe(false);
  });

  // Discriminating: strict no-op on the guarded path when the managed proxy is inactive —
  // no CA is injected, matching pre-fix behaviour for that path.
  it("does not add managed CA trust when the managed proxy is inactive", () => {
    createHttp1ProxyAgent({ uri: MANAGED_PROXY_URL });

    expect(caOf(proxyAgentOptions.at(0))).toBeUndefined();
  });

  // Discriminating: managed CA is scoped to the matching proxy URL only.
  it("does not add managed CA trust to a proxy URI that does not match the managed proxy", () => {
    registerManagedProxy("managed-proxy-ca");

    createHttp1ProxyAgent({ uri: "https://other-proxy.example:8443" });

    expect(caOf(proxyAgentOptions.at(0))).toBeUndefined();
  });

  // Discriminating (#2960 dispatcher-preservation): wiring CA trust must not disturb the
  // DNS-pinned `connect.lookup` a guarded caller supplies.
  it("preserves a caller-supplied connect.lookup while adding managed CA trust", () => {
    registerManagedProxy("managed-env-proxy-ca");
    const lookup = (): void => {};

    createHttp1EnvHttpProxyAgent({ httpsProxy: MANAGED_PROXY_URL, connect: { lookup } });

    const options = envHttpProxyAgentOptions.at(0);
    expect(asRecord(options?.connect, "connect").lookup).toBe(lookup);
    expect(caOf(options)).toBe("managed-env-proxy-ca");
  });

  // Discriminating: a caller-supplied proxyTls.ca wins over the managed CA (no override).
  it("does not override a caller-supplied proxyTls.ca", () => {
    registerManagedProxy("managed-proxy-ca");

    createHttp1ProxyAgent({ uri: MANAGED_PROXY_URL, proxyTls: { ca: "caller-ca" } });

    expect(caOf(proxyAgentOptions.at(0))).toBe("caller-ca");
  });
});
