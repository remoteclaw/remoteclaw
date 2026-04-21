import { describe, expect, it, vi } from "vitest";
import { generateUUID } from "./uuid.ts";

describe("generateUUID", () => {
  it("uses crypto.randomUUID when available", () => {
    const id = generateUUID({
      randomUUID: () => "randomuuid",
      getRandomValues: () => {
        throw new Error("should not be called");
      },
    });

    expect(id).toBe("randomuuid");
  });

  it("falls back to crypto.getRandomValues", () => {
    const id = generateUUID({
      getRandomValues: (bytes) => {
        const u8 = bytes as unknown as Uint8Array;
        for (let i = 0; i < u8.length; i++) {
          u8[i] = i;
        }
        return bytes;
      },
    });

    expect(id).toBe("00010203-0405-4607-8809-0a0b0c0d0e0f");
  });

  it("still returns a v4 UUID when crypto is missing", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const id = generateUUID(null);
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });
});
