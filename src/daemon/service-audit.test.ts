// Daemon service audit tests cover installed service inspection and warnings.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  auditGatewayServiceConfig,
  checkTokenDrift,
  SERVICE_AUDIT_CODES,
} from "./service-audit.js";
import { buildMinimalServicePath } from "./service-env.js";

function hasIssue(
  audit: Awaited<ReturnType<typeof auditGatewayServiceConfig>>,
  code: (typeof SERVICE_AUDIT_CODES)[keyof typeof SERVICE_AUDIT_CODES],
) {
  return audit.issues.some((issue) => issue.code === code);
}

function createGatewayAudit({
  expectedGatewayToken,
  path = "/usr/local/bin:/usr/bin:/bin",
  serviceToken,
  environmentValueSources,
}: {
  expectedGatewayToken?: string;
  path?: string;
  serviceToken?: string;
  environmentValueSources?: Record<string, "file" | "inline">;
} = {}) {
  return auditGatewayServiceConfig({
    env: { HOME: "/tmp" },
    platform: "linux",
    expectedGatewayToken,
    command: {
      programArguments: ["/usr/bin/node", "gateway"],
      environment: {
        PATH: path,
        ...(serviceToken ? { REMOTECLAW_GATEWAY_TOKEN: serviceToken } : {}),
      },
      ...(environmentValueSources ? { environmentValueSources } : {}),
    },
  });
}

async function writeSystemdUnitForAudit(home: string, lines: string[]) {
  const unitDir = path.join(home, ".config", "systemd", "user");
  const unitPath = path.join(unitDir, "remoteclaw-gateway.service");
  await fs.mkdir(unitDir, { recursive: true });
  await fs.writeFile(
    unitPath,
    [
      "[Unit]",
      "Description=RemoteClaw Gateway",
      "[Service]",
      ...lines,
      "ExecStart=/usr/bin/node gateway",
      "",
      "[Install]",
      "WantedBy=default.target",
      "",
    ].join("\n"),
    "utf8",
  );
}

function expectTokenAudit(
  audit: Awaited<ReturnType<typeof auditGatewayServiceConfig>>,
  {
    embedded,
    mismatch,
  }: {
    embedded: boolean;
    mismatch: boolean;
  },
) {
  expect(hasIssue(audit, SERVICE_AUDIT_CODES.gatewayTokenEmbedded)).toBe(embedded);
  expect(hasIssue(audit, SERVICE_AUDIT_CODES.gatewayTokenMismatch)).toBe(mismatch);
}

describe("auditGatewayServiceConfig", () => {
  it("flags bun runtime", async () => {
    const audit = await auditGatewayServiceConfig({
      env: { HOME: "/tmp" },
      platform: "darwin",
      command: {
        programArguments: ["/opt/homebrew/bin/bun", "gateway"],
        environment: { PATH: "/usr/bin:/bin" },
      },
    });
    expect(hasIssue(audit, SERVICE_AUDIT_CODES.gatewayRuntimeBun)).toBe(true);
    expect(
      audit.issues.find((issue) => issue.code === SERVICE_AUDIT_CODES.gatewayRuntimeBun)?.message,
    ).toContain("runtime state requires node:sqlite");
  });

  it("flags version-managed node paths", async () => {
    const audit = await auditGatewayServiceConfig({
      env: { HOME: "/tmp" },
      platform: "darwin",
      command: {
        programArguments: ["/Users/test/.nvm/versions/node/v22.0.0/bin/node", "gateway"],
        environment: {
          PATH: "/usr/bin:/bin:/Users/test/.nvm/versions/node/v22.0.0/bin",
        },
      },
    });
    expect(
      audit.issues.some(
        (issue) => issue.code === SERVICE_AUDIT_CODES.gatewayRuntimeNodeVersionManager,
      ),
    ).toBe(true);
    expect(
      audit.issues.some((issue) => issue.code === SERVICE_AUDIT_CODES.gatewayPathNonMinimal),
    ).toBe(true);
    expect(
      audit.issues.some((issue) => issue.code === SERVICE_AUDIT_CODES.gatewayPathMissingDirs),
    ).toBe(true);
  });

  it("accepts Linux minimal PATH with user directories", async () => {
    const env = { HOME: "/home/testuser", PNPM_HOME: "/opt/pnpm" };
    const minimalPath = buildMinimalServicePath({ platform: "linux", env });
    const audit = await auditGatewayServiceConfig({
      env,
      platform: "linux",
      command: {
        programArguments: ["/usr/bin/node", "gateway"],
        environment: { PATH: minimalPath },
      },
    });

    expect(
      audit.issues.some((issue) => issue.code === SERVICE_AUDIT_CODES.gatewayPathNonMinimal),
    ).toBe(false);
    expect(
      audit.issues.some((issue) => issue.code === SERVICE_AUDIT_CODES.gatewayPathMissingDirs),
    ).toBe(false);
  });

  it("flags gateway token mismatch when service token is stale", async () => {
    const audit = await createGatewayAudit({
      expectedGatewayToken: "new-token",
      serviceToken: "old-token",
    });
    expectTokenAudit(audit, { embedded: true, mismatch: true });
  });

  it.each(["process", "none"])(
    `warns when KillMode is %s in explicit unit file`,
    async (killMode) => {
      const home = await fs.mkdtemp(path.join(os.tmpdir(), "remoteclaw-service-audit-killmode-"));
      await writeSystemdUnitForAudit(home, [
        "After=network-online.target",
        "Wants=network-online.target",
        "RestartSec=5",
        `KillMode=${killMode}`,
      ]);

      const audit = await auditGatewayServiceConfig({
        env: { HOME: home },
        platform: "linux",
        command: {
          programArguments: ["/usr/bin/node", "gateway"],
          environment: { PATH: "/usr/bin:/bin" },
        },
      });
      expect(
        audit.issues.some(
          (entry) => entry.code === SERVICE_AUDIT_CODES.systemdKillModeProcessOrNone,
        ),
      ).toBe(true);
    },
  );

  it("does not warn when KillMode is control-group", async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), "remoteclaw-service-audit-killmode-"));
    await writeSystemdUnitForAudit(home, [
      "After=network-online.target",
      "Wants=network-online.target",
      "RestartSec=5",
      "KillMode=control-group",
    ]);
    const audit = await auditGatewayServiceConfig({
      env: { HOME: home },
      platform: "linux",
      command: {
        programArguments: ["/usr/bin/node", "gateway"],
        environment: { PATH: "/usr/bin:/bin" },
      },
    });
    expect(
      audit.issues.some((entry) => entry.code === SERVICE_AUDIT_CODES.systemdKillModeProcessOrNone),
    ).toBe(false);
  });

  it("flags embedded service token even when it matches config token", async () => {
    const audit = await createGatewayAudit({
      expectedGatewayToken: "new-token",
      serviceToken: "new-token",
    });
    expectTokenAudit(audit, { embedded: true, mismatch: false });
  });

  it("does not flag token issues when service token is not embedded", async () => {
    const audit = await createGatewayAudit({
      expectedGatewayToken: "new-token",
    });
    expectTokenAudit(audit, { embedded: false, mismatch: false });
  });

  it("does not treat EnvironmentFile-backed tokens as embedded", async () => {
    const audit = await createGatewayAudit({
      expectedGatewayToken: "new-token",
      serviceToken: "old-token",
      environmentValueSources: {
        REMOTECLAW_GATEWAY_TOKEN: "file",
      },
    });
    expectTokenAudit(audit, { embedded: false, mismatch: false });
  });
});

describe("checkTokenDrift", () => {
  it("returns null when both tokens are undefined", () => {
    const result = checkTokenDrift({ serviceToken: undefined, configToken: undefined });
    expect(result).toBeNull();
  });

  it("returns null when both tokens are empty strings", () => {
    const result = checkTokenDrift({ serviceToken: "", configToken: "" });
    expect(result).toBeNull();
  });

  it("returns null when tokens match", () => {
    const result = checkTokenDrift({ serviceToken: "same-token", configToken: "same-token" });
    expect(result).toBeNull();
  });

  it("returns null when tokens match but service token has trailing newline", () => {
    const result = checkTokenDrift({ serviceToken: "same-token\n", configToken: "same-token" });
    expect(result).toBeNull();
  });

  it("returns null when tokens match but have surrounding whitespace", () => {
    const result = checkTokenDrift({ serviceToken: "  same-token  ", configToken: "same-token" });
    expect(result).toBeNull();
  });

  it("returns null when both tokens have different whitespace padding", () => {
    const result = checkTokenDrift({
      serviceToken: "same-token\r\n",
      configToken: " same-token ",
    });
    expect(result).toBeNull();
  });

  it("detects drift when config has token but service has different token", () => {
    const result = checkTokenDrift({ serviceToken: "old-token", configToken: "new-token" });
    expect(result).toStrictEqual({
      code: SERVICE_AUDIT_CODES.gatewayTokenDrift,
      message:
        "Config token differs from service token. The daemon will use the old token after restart.",
      detail: "Run `remoteclaw gateway install --force` to sync the token.",
      level: "recommended",
    });
  });

  it("returns null when config has token but service has no token", () => {
    const result = checkTokenDrift({ serviceToken: undefined, configToken: "new-token" });
    expect(result).toBeNull();
  });

  it("returns null when service has token but config does not", () => {
    // This is not really drift - service will work, just config is incomplete
    const result = checkTokenDrift({ serviceToken: "service-token", configToken: undefined });
    expect(result).toBeNull();
  });
});
