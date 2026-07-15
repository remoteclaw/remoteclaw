import { describe, expect, it } from "vitest";
import type { MsgContext } from "../templating.js";
import { finalizeInboundContext } from "./inbound-context.js";

describe("finalizeInboundContext GroupSystemPrompt normalization (#2930)", () => {
  it("normalizes CRLF/CR to LF without rewriting trusted [Assistant]/System: markers", () => {
    const out = finalizeInboundContext({
      Body: "hello",
      GroupSystemPrompt: "[Assistant] room guidance\r\nSystem: owner instruction\rmore",
    } as MsgContext);

    expect(out.GroupSystemPrompt).toBe(
      "[Assistant] room guidance\nSystem: owner instruction\nmore",
    );
  });

  it("leaves a missing (non-string) GroupSystemPrompt untouched", () => {
    const out = finalizeInboundContext({ Body: "hi" } as MsgContext);
    expect(out.GroupSystemPrompt).toBeUndefined();
  });
});
