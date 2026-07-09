import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createAcpxProcessLeaseStore,
  REMOTECLAW_ACPX_LEASE_ID_ARG,
  REMOTECLAW_ACPX_LEASE_ID_ENV,
  REMOTECLAW_GATEWAY_INSTANCE_ID_ARG,
  REMOTECLAW_GATEWAY_INSTANCE_ID_ENV,
  withAcpxLeaseEnvironment,
  type AcpxProcessLease,
} from "./process-lease.js";

function makeLease(index: number): AcpxProcessLease {
  return {
    leaseId: `lease-${index}`,
    gatewayInstanceId: "gateway-test",
    sessionKey: `agent:codex:acp:${index}`,
    wrapperRoot: "/tmp/remoteclaw/acpx",
    wrapperPath: "/tmp/remoteclaw/acpx/codex-acp-wrapper.mjs",
    rootPid: 1000 + index,
    commandHash: `hash-${index}`,
    startedAt: index,
    state: "open",
  };
}

describe("createAcpxProcessLeaseStore", () => {
  it("serializes concurrent lease saves without dropping records", async () => {
    const stateDir = await mkdtemp(path.join(tmpdir(), "remoteclaw-acpx-leases-"));
    try {
      const store = createAcpxProcessLeaseStore({ stateDir });
      await Promise.all(Array.from({ length: 25 }, (_, index) => store.save(makeLease(index))));

      const leases = await store.listOpen("gateway-test");
      expect(leases.map((lease) => lease.leaseId).toSorted()).toEqual(
        Array.from({ length: 25 }, (_, index) => `lease-${index}`).toSorted(),
      );
    } finally {
      await rm(stateDir, { recursive: true, force: true });
    }
  });
});

describe("withAcpxLeaseEnvironment", () => {
  it("adds lease environment and wrapper args on POSIX", () => {
    const command = withAcpxLeaseEnvironment({
      command: "node /tmp/remoteclaw/acpx/codex-acp-wrapper.mjs",
      leaseId: "lease-test",
      gatewayInstanceId: "gateway-test",
      platform: "darwin",
    });

    expect(command).toBe(
      [
        "env",
        `${REMOTECLAW_ACPX_LEASE_ID_ENV}=lease-test`,
        `${REMOTECLAW_GATEWAY_INSTANCE_ID_ENV}=gateway-test`,
        "node /tmp/remoteclaw/acpx/codex-acp-wrapper.mjs",
        REMOTECLAW_ACPX_LEASE_ID_ARG,
        "lease-test",
        REMOTECLAW_GATEWAY_INSTANCE_ID_ARG,
        "gateway-test",
      ].join(" "),
    );
  });

  it("keeps Windows logs keyed by lease id with wrapper args", () => {
    const command = withAcpxLeaseEnvironment({
      command: "node C:/remoteclaw/acpx/codex-acp-wrapper.mjs",
      leaseId: "lease-test",
      gatewayInstanceId: "gateway-test",
      platform: "win32",
    });

    expect(command).toBe(
      [
        "node C:/remoteclaw/acpx/codex-acp-wrapper.mjs",
        REMOTECLAW_ACPX_LEASE_ID_ARG,
        "lease-test",
        REMOTECLAW_GATEWAY_INSTANCE_ID_ARG,
        "gateway-test",
      ].join(" "),
    );
    expect(command).not.toContain(`${REMOTECLAW_ACPX_LEASE_ID_ENV}=`);
    expect(command).not.toContain(`${REMOTECLAW_GATEWAY_INSTANCE_ID_ENV}=`);
  });
});
