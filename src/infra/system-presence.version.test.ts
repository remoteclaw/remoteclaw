import { describe, expect, it, vi } from "vitest";
import { withEnvAsync } from "../test-utils/env.js";

async function withPresenceModule<T>(
  env: Record<string, string | undefined>,
  run: (module: typeof import("./system-presence.js")) => Promise<T> | T,
): Promise<T> {
  return withEnvAsync(env, async () => {
    vi.resetModules();
    const module = await import("./system-presence.js");
    return await run(module);
  });
}

describe("system-presence version fallback", () => {
  async function expectSelfVersion(
    env: Record<string, string | undefined>,
    expectedVersion: string | (() => Promise<string>),
  ) {
    await withPresenceModule(env, async ({ listSystemPresence }) => {
      const selfEntry = listSystemPresence().find((entry) => entry.reason === "self");
      const resolvedExpected =
        typeof expectedVersion === "function" ? await expectedVersion() : expectedVersion;
      expect(selfEntry?.version).toBe(resolvedExpected);
    });
  }

  it("uses runtime VERSION when REMOTECLAW_VERSION is not set", async () => {
    await expectSelfVersion(
      {
        REMOTECLAW_SERVICE_VERSION: "2.4.6-service",
        npm_package_version: "1.0.0-package",
      },
      async () => (await import("../version.js")).VERSION,
    );
  });

  it("prefers REMOTECLAW_VERSION over runtime VERSION", async () => {
    await expectSelfVersion(
      {
        REMOTECLAW_VERSION: "9.9.9-cli",
        REMOTECLAW_SERVICE_VERSION: "2.4.6-service",
        npm_package_version: "1.0.0-package",
      },
      "9.9.9-cli",
    );
  });

  it("still prefers runtime VERSION over REMOTECLAW_SERVICE_VERSION when REMOTECLAW_VERSION is blank", async () => {
    await expectSelfVersion(
      {
        REMOTECLAW_VERSION: " ",
        REMOTECLAW_SERVICE_VERSION: "2.4.6-service",
        npm_package_version: "1.0.0-package",
      },
      async () => (await import("../version.js")).VERSION,
    );
  });

  it("still prefers runtime VERSION over npm_package_version when service markers are blank", async () => {
    await expectSelfVersion(
      {
        REMOTECLAW_VERSION: " ",
        REMOTECLAW_SERVICE_VERSION: "\t",
        npm_package_version: "1.0.0-package",
      },
      async () => (await import("../version.js")).VERSION,
    );
  });

  it("uses runtime VERSION when REMOTECLAW_VERSION and REMOTECLAW_SERVICE_VERSION are blank", async () => {
    await expectSelfVersion(
      {
        REMOTECLAW_VERSION: " ",
        REMOTECLAW_SERVICE_VERSION: "\t",
        npm_package_version: "1.0.0-package",
      },
      async () => (await import("../version.js")).VERSION,
    );
  });
});
