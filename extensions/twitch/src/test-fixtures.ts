import type { RemoteClawConfig } from "remoteclaw/plugin-sdk";
import { afterEach, beforeEach, vi } from "vitest";
<<<<<<< HEAD
||||||| parent of d1fe30b35f (Plugins: add Twitch runtime barrel)
import type { OpenClawConfig } from "../api.js";
=======
import type { OpenClawConfig } from "../runtime-api.js";
>>>>>>> d1fe30b35f (Plugins: add Twitch runtime barrel)

export const BASE_TWITCH_TEST_ACCOUNT = {
  username: "testbot",
  clientId: "test-client-id",
  channel: "#testchannel",
};

export function makeTwitchTestConfig(account: Record<string, unknown>): RemoteClawConfig {
  return {
    channels: {
      twitch: {
        accounts: {
          default: account,
        },
      },
    },
  } as unknown as RemoteClawConfig;
}

export function installTwitchTestHooks() {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
}
