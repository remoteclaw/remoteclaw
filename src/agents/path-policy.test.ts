import { describe, expect, it, vi } from "vitest";
import { toRelativeWorkspacePath } from "./path-policy.js";

// Gutted in RemoteClaw fork — resolveSandboxInputPath was inlined into
// path-policy.ts (no longer imported from sandbox-paths.js). The inline
// stub uses POSIX path.resolve on macOS, so Windows path simulation tests
// cannot work without a real win32 environment.
describe("toRelativeWorkspacePath (windows semantics)", () => {
  it.skip("accepts windows paths with mixed separators and case — gutted sandbox-paths mock", () => {
    const platformSpy = vi.spyOn(process, "platform", "get").mockReturnValue("win32");
    try {
      const root = "C:\\Users\\User\\RemoteClaw";
      const candidate = "c:/users/user/remoteclaw/memory/log.txt";
      expect(toRelativeWorkspacePath(root, candidate)).toBe("memory\\log.txt");
    } finally {
      platformSpy.mockRestore();
    }
  });

  it.skip("rejects windows paths outside workspace root — gutted sandbox-paths mock", () => {
    const platformSpy = vi.spyOn(process, "platform", "get").mockReturnValue("win32");
    try {
      const root = "C:\\Users\\User\\RemoteClaw";
      const candidate = "C:\\Users\\User\\Other\\log.txt";
      expect(() => toRelativeWorkspacePath(root, candidate)).toThrow("Path escapes workspace root");
    } finally {
      platformSpy.mockRestore();
    }
  });
});
