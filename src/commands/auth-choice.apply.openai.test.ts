import { describe, expect, it } from "vitest";
import { applyAuthChoiceOpenAI } from "./auth-choice.apply.openai.js";

describe("applyAuthChoiceOpenAI (gutted)", () => {
  it("is a no-op stub that resolves without error", async () => {
    await expect(applyAuthChoiceOpenAI()).resolves.toBeUndefined();
  });
});
