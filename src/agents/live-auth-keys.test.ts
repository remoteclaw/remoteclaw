import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_MODELSTUDIO_API_KEY = process.env.MODELSTUDIO_API_KEY;
const ORIGINAL_XAI_API_KEY = process.env.XAI_API_KEY;
let collectProviderApiKeys: typeof import("./live-auth-keys.js").collectProviderApiKeys;
let clearPluginManifestRegistryCache: typeof import("../plugins/manifest-registry.js").clearPluginManifestRegistryCache;
let isAnthropicBillingError: typeof import("./live-auth-keys.js").isAnthropicBillingError;

async function loadModulesForTest(): Promise<void> {
  ({ clearPluginManifestRegistryCache } = await import("../plugins/manifest-registry.js"));
  ({ collectProviderApiKeys } = await import("./live-auth-keys.js"));
}

function clearManifestRegistryCache(): void {
  clearPluginManifestRegistryCache();
}

describe("collectProviderApiKeys", () => {
  beforeAll(async () => {
    vi.doUnmock("../plugins/manifest-registry.js");
    vi.doUnmock("../secrets/provider-env-vars.js");
    await loadModulesForTest();
  });

  beforeEach(() => {
    clearManifestRegistryCache();
  });

  afterEach(() => {
    clearManifestRegistryCache();
    if (ORIGINAL_MODELSTUDIO_API_KEY === undefined) {
      delete process.env.MODELSTUDIO_API_KEY;
    } else {
      process.env.MODELSTUDIO_API_KEY = ORIGINAL_MODELSTUDIO_API_KEY;
    }
    if (ORIGINAL_XAI_API_KEY === undefined) {
      delete process.env.XAI_API_KEY;
    } else {
      process.env.XAI_API_KEY = ORIGINAL_XAI_API_KEY;
    }
  });

  it("honors manifest-declared provider auth env vars for nonstandard provider ids", async () => {
    process.env.MODELSTUDIO_API_KEY = "modelstudio-live-key";

    expect(collectProviderApiKeys("alibaba")).toContain("modelstudio-live-key");
  });

  it("dedupes manifest env vars against direct provider env naming", async () => {
    process.env.XAI_API_KEY = "xai-live-key";

    expect(collectProviderApiKeys("xai")).toEqual(["xai-live-key"]);
  });
});

describe("isAnthropicBillingError", () => {
  it("does not false-positive on plain 'a 402' prose", () => {
    const samples = [
      "Use a 402 stainless bolt",
      "Book a 402 room",
      "There is a 402 near me",
      "The building at 402 Main Street",
    ];

    for (const sample of samples) {
      expect(isAnthropicBillingError(sample)).toBe(false);
    }
  });

  it("matches real 402 billing payload contexts including JSON keys", () => {
    const samples = [
      "HTTP 402 Payment Required",
      "status: 402",
      "error code 402",
      '{"status":402,"type":"error"}',
      '{"code":402,"message":"payment required"}',
      '{"error":{"code":402,"message":"billing hard limit reached"}}',
      "got a 402 from the API",
      "returned 402",
      "received a 402 response",
    ];

    for (const sample of samples) {
      expect(isAnthropicBillingError(sample)).toBe(true);
    }
  });
});
