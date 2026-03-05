import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveDefaultAgentWorkspaceDir } from "./workspace.js";

describe("resolveDefaultAgentWorkspaceDir", () => {
  it("uses REMOTECLAW_HOME for default workspace resolution", () => {
    const dir = resolveDefaultAgentWorkspaceDir({
      REMOTECLAW_HOME: "/srv/remoteclaw-home",
      HOME: "/home/other",
    } as NodeJS.ProcessEnv);

    expect(dir).toBe(path.join(path.resolve("/srv/remoteclaw-home"), ".remoteclaw", "workspace"));
  });
});
