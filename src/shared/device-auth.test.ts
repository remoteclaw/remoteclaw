import { describe, expect, it } from "vitest";
import { normalizeDeviceAuthRole, normalizeDeviceAuthScopes } from "./device-auth.js";

describe("shared/device-auth", () => {
  it("trims device auth roles without further rewriting", () => {
    expect(normalizeDeviceAuthRole(" operator ")).toBe("operator");
    expect(normalizeDeviceAuthRole("")).toBe("");
    expect(normalizeDeviceAuthRole("  NODE.Admin  ")).toBe("NODE.Admin");
  });

  it("dedupes, trims, sorts, and filters auth scopes", () => {
    expect(
      normalizeDeviceAuthScopes([" node.invoke ", "operator.read", "", "node.invoke", "a.scope"]),
    ).toEqual(["a.scope", "node.invoke", "operator.read"]);
    expect(normalizeDeviceAuthScopes(undefined)).toStrictEqual([]);
    expect(normalizeDeviceAuthScopes(null as unknown as string[])).toStrictEqual([]);
    expect(normalizeDeviceAuthScopes(["   ", "\t", "\n"])).toStrictEqual([]);
    expect(normalizeDeviceAuthScopes(["z.scope", "A.scope", "m.scope"])).toEqual([
      "A.scope",
      "m.scope",
      "z.scope",
    ]);
  });
});
