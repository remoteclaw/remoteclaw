import { describe, expect, it } from "vitest";
import { readFields } from "./shared.js";

describe("readFields", () => {
  it.each([
    {
      name: "keeps explicit type",
      fields: '[{"ref":"6","type":"textbox","value":"hello"}]',
      expected: [{ ref: "6", type: "textbox", value: "hello" }],
    },
  ])("$name", async ({ fields, expected }) => {
    await expect(readFields({ fields })).resolves.toEqual(expected);
  });

  it("accepts field without type", async () => {
    await expect(readFields({ fields: '[{"ref":"7","value":"world"}]' })).resolves.toEqual([
      { ref: "7", type: undefined, value: "world" },
    ]);
  });

  it("accepts blank type as undefined", async () => {
    await expect(
      readFields({ fields: '[{"ref":"8","type":"   ","value":"blank"}]' }),
    ).resolves.toEqual([{ ref: "8", type: undefined, value: "blank" }]);
  });

  it("requires ref", async () => {
    await expect(readFields({ fields: '[{"type":"textbox","value":"world"}]' })).rejects.toThrow(
      "fields[0] must include ref",
    );
  });
});
