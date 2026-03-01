import "./reply.directive.directive-behavior.e2e-mocks.js";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import {
  assertModelSelection,
  installDirectiveBehaviorE2EHooks,
  runAgent,
  withTempHome,
} from "./reply.directive.directive-behavior.e2e-harness.js";
import { getReplyFromConfig } from "./reply.js";

type ModelDefinitionConfig = {
  id: string;
  name: string;
  reasoning: boolean;
  input: string[];
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
  contextWindow: number;
  maxTokens: number;
};

function makeModelDefinition(id: string, name: string): ModelDefinitionConfig {
  return {
    id,
    name,
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 8_192,
  };
}

describe("directive behavior", () => {
  installDirectiveBehaviorE2EHooks();

  it("picks the best fuzzy match for global and provider-scoped minimax queries", async () => {
    await withTempHome(async (home) => {
      for (const testCase of [
        {
          body: "/model minimax",
          storePath: path.join(home, "sessions-global-fuzzy.json"),
          config: {
            agents: {
              defaults: {
                model: { primary: "minimax/MiniMax-M2.1" },
                workspace: path.join(home, "openclaw"),
                models: {
                  "minimax/MiniMax-M2.1": {},
                  "minimax/MiniMax-M2.1-lightning": {},
                  "lmstudio/minimax-m2.1-gs32": {},
                },
              },
            },
            models: {
              mode: "merge",
              providers: {
                minimax: {
                  baseUrl: "https://api.minimax.io/anthropic",
                  apiKey: "sk-test",
                  api: "anthropic-messages",
                  models: [makeModelDefinition("MiniMax-M2.1", "MiniMax M2.1")],
                },
                lmstudio: {
                  baseUrl: "http://127.0.0.1:1234/v1",
                  apiKey: "lmstudio",
                  api: "openai-responses",
                  models: [makeModelDefinition("minimax-m2.1-gs32", "MiniMax M2.1 GS32")],
                },
              },
            },
          },
        },
        {
          body: "/model minimax/m2.1",
          storePath: path.join(home, "sessions-provider-fuzzy.json"),
          config: {
            agents: {
              defaults: {
                model: { primary: "minimax/MiniMax-M2.1" },
                workspace: path.join(home, "openclaw"),
                models: {
                  "minimax/MiniMax-M2.1": {},
                  "minimax/MiniMax-M2.1-lightning": {},
                },
              },
            },
            models: {
              mode: "merge",
              providers: {
                minimax: {
                  baseUrl: "https://api.minimax.io/anthropic",
                  apiKey: "sk-test",
                  api: "anthropic-messages",
                  models: [
                    makeModelDefinition("MiniMax-M2.1", "MiniMax M2.1"),
                    makeModelDefinition("MiniMax-M2.1-lightning", "MiniMax M2.1 Lightning"),
                  ],
                },
              },
            },
          },
        },
      ]) {
        await getReplyFromConfig(
          { Body: testCase.body, From: "+1222", To: "+1222", CommandAuthorized: true },
          {},
          {
            ...testCase.config,
            session: { store: testCase.storePath },
          } as unknown as OpenClawConfig,
        );
        assertModelSelection(testCase.storePath);
      }
      expect(runAgent).not.toHaveBeenCalled();
    });
  });
});
