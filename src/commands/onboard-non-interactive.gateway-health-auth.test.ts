import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { RemoteClawConfig } from "../config/types.remoteclaw.js";
import { resolveGatewayHealthProbeToken } from "./onboard-non-interactive/local.js";

async function withTempDir<T>(run: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "remoteclaw-gateway-health-auth-"));
  try {
    return await run(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

async function writeSecureFile(filePath: string, content: string): Promise<void> {
  await fs.writeFile(filePath, content, { mode: 0o600 });
  await fs.chmod(filePath, 0o600);
}

describe("resolveGatewayHealthProbeToken", () => {
  const originalGatewayToken = process.env.REMOTECLAW_GATEWAY_TOKEN;

  afterEach(() => {
    if (originalGatewayToken === undefined) {
      delete process.env.REMOTECLAW_GATEWAY_TOKEN;
    } else {
      process.env.REMOTECLAW_GATEWAY_TOKEN = originalGatewayToken;
    }
  });

  it("resolves file SecretRefs for the local onboarding health probe without persisting plaintext", async () => {
    await withTempDir(async (dir) => {
      const tokenPath = path.join(dir, "gateway-token.txt");
      await writeSecureFile(tokenPath, "file-secret-token\n");
      process.env.REMOTECLAW_GATEWAY_TOKEN = "stale-env-token";

      const resolved = await resolveGatewayHealthProbeToken({
        gateway: {
          auth: {
            mode: "token",
            token: {
              source: "file",
              provider: "gateway-token-file",
              id: "value",
            },
          },
        },
        secrets: {
          providers: {
            "gateway-token-file": {
              source: "file",
              path: tokenPath,
              mode: "singleValue",
            },
          },
        },
      } as RemoteClawConfig);

      expect(resolved).toEqual({ token: "file-secret-token" });
    });
  });

  it("does not fall back to stale REMOTECLAW_GATEWAY_TOKEN when a SecretRef is unresolved", async () => {
    await withTempDir(async (dir) => {
      process.env.REMOTECLAW_GATEWAY_TOKEN = "stale-env-token";

      const resolved = await resolveGatewayHealthProbeToken({
        gateway: {
          auth: {
            mode: "token",
            token: {
              source: "file",
              provider: "gateway-token-file",
              id: "value",
            },
          },
        },
        secrets: {
          providers: {
            "gateway-token-file": {
              source: "file",
              path: path.join(dir, "missing-token.txt"),
              mode: "singleValue",
            },
          },
        },
      } as RemoteClawConfig);

      expect(resolved.token).toBeUndefined();
      expect(resolved.unresolvedRefReason).toContain("gateway.auth.token SecretRef is unresolved");
    });
  });
});
