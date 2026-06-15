import { describe, expect, it, vi } from "vitest";
import { createTestRuntime } from "./test-runtime-config-helpers.js";

// Fork divergence: channelsListCommand resolves config via requireValidConfig
// (src/commands/channels/shared.ts) and reads auth via loadAuthProfileStore from
// the fork's consolidated src/auth/ barrel — NOT upstream's
// resolveCommandConfigWithSecrets + src/agents/auth-profiles path. Mock the fork
// seams so this test exercises the fork's real JSON-output code path.
const mocks = vi.hoisted(() => ({
  requireValidConfig: vi.fn(async () => ({}) as unknown),
  loadAuthProfileStore: vi.fn(),
  listChannelPlugins: vi.fn(() => []),
}));

vi.mock("./channels/shared.js", () => ({
  requireValidConfig: mocks.requireValidConfig,
  formatChannelAccountLabel: () => "",
}));

vi.mock("../auth/index.js", () => ({
  loadAuthProfileStore: mocks.loadAuthProfileStore,
}));

vi.mock("../channels/plugins/index.js", () => ({
  listChannelPlugins: mocks.listChannelPlugins,
}));

import { channelsListCommand } from "./channels/list.js";

describe("channels list auth profiles", () => {
  it("includes auth profiles in JSON output", async () => {
    const runtime = createTestRuntime();
    mocks.loadAuthProfileStore.mockReturnValue({
      version: 1,
      profiles: {
        "anthropic:default": {
          type: "oauth",
          provider: "anthropic",
          access: "token",
          refresh: "refresh",
          expires: 0,
          created: 0,
        },
        "openai-codex:default": {
          type: "oauth",
          provider: "openai",
          access: "token",
          refresh: "refresh",
          expires: 0,
          created: 0,
        },
      },
    });

    await channelsListCommand({ json: true }, runtime);

    const payload = JSON.parse(runtime.log.mock.calls[0]?.[0] as string) as {
      auth?: Array<{ id: string }>;
    };
    const ids = payload.auth?.map((entry) => entry.id) ?? [];
    expect(ids).toContain("anthropic:default");
    expect(ids).toContain("openai-codex:default");
  });
});
