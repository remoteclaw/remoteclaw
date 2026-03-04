import { describe, expect, it } from "vitest";
import { shortenText } from "./text-format.js";

describe("shortenText", () => {
  it("returns original text when it fits", () => {
    expect(shortenText("shorttext", 16)).toBe("shorttext");
  });

  it("truncates and appends ellipsis when over limit", () => {
    expect(shortenText("longtext-status-output", 10)).toBe("longtext-…");
  });

  it("counts multi-byte characters correctly", () => {
    expect(shortenText("hello🙂world", 7)).toBe("hello🙂…");
  });
});
