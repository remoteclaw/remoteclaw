// Doctor config-flow include-warning tests cover config include warnings during repair.
import { describe, expect, it, vi } from "vitest";
import { withTempHomeConfig } from "../config/test-helpers.js";
import { note } from "../terminal/note.js";

vi.mock("../terminal/note.js", () => ({
  note: vi.fn(),
}));

import { loadAndMaybeMigrateDoctorConfig } from "./doctor-config-flow.js";

const noteSpy = vi.mocked(note);

describe("doctor include warning", () => {
  it("surfaces include confinement hint for escaped include paths", async () => {
    await withTempHomeConfig({ $include: "/etc/passwd" }, async () => {
      await loadAndMaybeMigrateDoctorConfig({
        options: { nonInteractive: true },
        confirm: async () => false,
      });
    });

    expect(noteSpy).toHaveBeenCalledWith(
      [
        "- $include paths must stay under: /tmp/remoteclaw-config",
        '- Move shared include files under that directory and update to relative paths like "./shared/common.json".',
        "- Error: Include path escapes config directory: /etc/passwd",
      ].join("\n"),
      "Doctor warnings",
    );
  });
});
