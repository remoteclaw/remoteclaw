import { describe, expect, it } from "vitest";
import { applyAuthChoiceBytePlus } from "./auth-choice.apply.byteplus.js";
import { applyAuthChoiceVolcengine } from "./auth-choice.apply.volcengine.js";

describe("volcengine/byteplus auth choice (gutted)", () => {
  it("volcengine stub resolves without error", async () => {
    await expect(applyAuthChoiceVolcengine()).resolves.toBeUndefined();
  });

  it("byteplus stub resolves without error", async () => {
    await expect(applyAuthChoiceBytePlus()).resolves.toBeUndefined();
  });
});
