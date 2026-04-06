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

  it("rejects missing type", async () => {
    await expect(readFields({ fields: '[{"ref":"7","value":"world"}]' })).rejects.toThrow(
      "fields[0] must include ref and type",
    );
  });

  it("rejects blank type", async () => {
    await expect(
      readFields({ fields: '[{"ref":"8","type":"   ","value":"blank"}]' }),
    ).rejects.toThrow("fields[0] must include ref and type");
  });

  it("requires ref", async () => {
    await expect(readFields({ fields: '[{"type":"textbox","value":"world"}]' })).rejects.toThrow(
      "fields[0] must include ref and type",
    );
  });
});
