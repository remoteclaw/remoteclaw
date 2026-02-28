import { describe, expect, it } from "vitest";
import { findRoutedCommand } from "./routes.js";

describe("program routes", () => {
  function expectRoute(path: string[]) {
    const route = findRoutedCommand(path);
    expect(route).not.toBeNull();
    return route;
  }

  async function expectRunFalse(path: string[], argv: string[]) {
    const route = expectRoute(path);
    await expect(route?.run(argv)).resolves.toBe(false);
  }

  it("matches status route and preserves plugin loading", () => {
    const route = expectRoute(["status"]);
    expect(route?.loadPlugins).toBe(true);
  });

  it("returns false when status timeout flag value is missing", async () => {
    await expectRunFalse(["status"], ["node", "openclaw", "status", "--timeout"]);
  });

  it("returns false for sessions route when --store value is missing", async () => {
    await expectRunFalse(["sessions"], ["node", "openclaw", "sessions", "--store"]);
  });

  it("returns false for sessions route when --active value is missing", async () => {
    await expectRunFalse(["sessions"], ["node", "openclaw", "sessions", "--active"]);
  });

  it("returns false for sessions route when --agent value is missing", async () => {
    await expectRunFalse(["sessions"], ["node", "openclaw", "sessions", "--agent"]);
  });

  it("does not fast-route sessions subcommands", () => {
    expect(findRoutedCommand(["sessions", "cleanup"])).toBeNull();
  });

  it("does not match unknown routes", () => {
    expect(findRoutedCommand(["definitely-not-real"])).toBeNull();
  });

  it("returns false for config get route when path argument is missing", async () => {
    await expectRunFalse(["config", "get"], ["node", "openclaw", "config", "get", "--json"]);
  });

  it("returns false for config unset route when path argument is missing", async () => {
    await expectRunFalse(["config", "unset"], ["node", "openclaw", "config", "unset"]);
  });

  it("returns false for memory status route when --agent value is missing", async () => {
    await expectRunFalse(["memory", "status"], ["node", "openclaw", "memory", "status", "--agent"]);
  });
});
