import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createDoctorRuntime, mockDoctorConfigSnapshot, note } from "./doctor.e2e-harness.js";
import "./doctor.fast-path-mocks.js";

vi.doUnmock("./doctor-state-integrity.js");

let doctorCommand: typeof import("./doctor.js").doctorCommand;

describe("doctor command", () => {
  beforeAll(async () => {
    ({ doctorCommand } = await import("./doctor.js"));
  });

  it("warns when the state directory is missing", async () => {
    mockDoctorConfigSnapshot();

    const missingDir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-missing-state-"));
    fs.rmSync(missingDir, { recursive: true, force: true });
    process.env.REMOTECLAW_STATE_DIR = missingDir;
    note.mockClear();

    await doctorCommand(createDoctorRuntime(), {
      nonInteractive: true,
      workspaceSuggestions: false,
    });

    const stateNote = note.mock.calls.find((call) => call[1] === "State integrity");
    expect(stateNote).toBeTruthy();
    expect(String(stateNote?.[0])).toContain("CRITICAL");
  });

  // Test "warns about opencode provider overrides" removed:
  // noteOpencodeProviderOverrides is now a no-op (config.models.providers was gutted).

  it("skips gateway auth warning when REMOTECLAW_GATEWAY_TOKEN is set", async () => {
    mockDoctorConfigSnapshot({
      config: {
        gateway: { mode: "local" },
      },
    });

    const prevToken = process.env.REMOTECLAW_GATEWAY_TOKEN;
    process.env.REMOTECLAW_GATEWAY_TOKEN = "env-token-1234567890";
    note.mockClear();

    try {
      await doctorCommand(createDoctorRuntime(), {
        nonInteractive: true,
        workspaceSuggestions: false,
      });
    } finally {
      if (prevToken === undefined) {
        delete process.env.REMOTECLAW_GATEWAY_TOKEN;
      } else {
        process.env.REMOTECLAW_GATEWAY_TOKEN = prevToken;
      }
    }

    const warned = note.mock.calls.some(([message]) =>
      String(message).includes("Gateway auth is off or missing a token"),
    );
    expect(warned).toBe(false);
  });
});
