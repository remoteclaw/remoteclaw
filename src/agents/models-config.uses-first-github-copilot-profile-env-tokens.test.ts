import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  installModelsConfigTestHooks,
  mockCopilotTokenExchangeSuccess,
  withUnsetCopilotTokenEnv,
  withModelsTempHome as withTempHome,
} from "./models-config.e2e-harness.js";
import { ensureOpenClawModelsJson } from "./models-config.js";

installModelsConfigTestHooks({ restoreFetch: true });

describe("models-config", () => {
  it("uses the first github-copilot profile when env tokens are missing", async () => {
    await withTempHome(async (home) => {
      await withUnsetCopilotTokenEnv(async () => {
        const fetchMock = mockCopilotTokenExchangeSuccess();
        const agentDir = path.join(home, "agent-profiles");
        await fs.mkdir(agentDir, { recursive: true });
        await fs.writeFile(
          path.join(agentDir, "auth-profiles.json"),
          JSON.stringify(
            {
              version: 1,
              profiles: {
                "github-copilot:alpha": {
                  type: "token",
                  provider: "github-copilot",
                  token: "alpha-token",
                },
                "github-copilot:beta": {
                  type: "token",
                  provider: "github-copilot",
                  token: "beta-token",
                },
              },
            },
            null,
            2,
          ),
        );

        await ensureOpenClawModelsJson({ models: { providers: {} } }, agentDir);

        const [, opts] = fetchMock.mock.calls[0] as [string, { headers?: Record<string, string> }];
        expect(opts?.headers?.Authorization).toBe("Bearer alpha-token");
      });
    });
  });

  // Test "does not override explicit github-copilot provider config" removed:
  // config.models.providers was gutted so explicit provider config is dead code.
});
