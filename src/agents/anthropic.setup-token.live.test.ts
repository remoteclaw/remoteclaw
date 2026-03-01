import { type Api, type Model } from "@mariozechner/pi-ai";
import { describe, expect, it } from "vitest";
import { normalizeProviderId, parseModelRef } from "./provider-utils.js";

// NOTE: The live setup-token test was removed because it depended on
// deleted model-management modules (model-auth, models-config, pi-model-discovery).

function pickModel(models: Array<Model<Api>>, raw?: string): Model<Api> | null {
  const normalized = raw?.trim() ?? "";
  if (normalized) {
    const parsed = parseModelRef(normalized, "anthropic");
    if (!parsed) {
      return null;
    }
    return (
      models.find(
        (model) =>
          normalizeProviderId(model.provider) === parsed.provider && model.id === parsed.model,
      ) ?? null
    );
  }

  const preferred = [
    "claude-opus-4-5",
    "claude-sonnet-4-6",
    "claude-sonnet-4-5",
    "claude-sonnet-4-0",
    "claude-haiku-3-5",
  ];
  for (const id of preferred) {
    const match = models.find((model) => model.id === id);
    if (match) {
      return match;
    }
  }
  return models[0] ?? null;
}

function buildTestModel(id: string, provider = "anthropic"): Model<Api> {
  return { id, provider } as Model<Api>;
}

describe("pickModel", () => {
  it("resolves sonnet-4.6 aliases to claude-sonnet-4-6", () => {
    const model = pickModel(
      [buildTestModel("claude-opus-4-6"), buildTestModel("claude-sonnet-4-6")],
      "sonnet-4.6",
    );
    expect(model?.id).toBe("claude-sonnet-4-6");
  });

  it("resolves opus-4.6 aliases to claude-opus-4-6", () => {
    const model = pickModel(
      [buildTestModel("claude-sonnet-4-6"), buildTestModel("claude-opus-4-6")],
      "opus-4.6",
    );
    expect(model?.id).toBe("claude-opus-4-6");
  });
});
