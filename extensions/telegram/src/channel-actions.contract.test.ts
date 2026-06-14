import type { RemoteClawConfig } from "remoteclaw/plugin-sdk/config-runtime";
import { describe } from "vitest";
import { installChannelActionsContractSuite } from "../../../test/helpers/channels/registry-contract-suites.js";
import { telegramPlugin } from "../api.js";

describe("telegram actions contract", () => {
  installChannelActionsContractSuite({
    plugin: telegramPlugin,
    cases: [
      {
        name: "exposes configured Telegram actions and capabilities",
        cfg: {
          channels: {
            telegram: {
              botToken: "123:telegram-test-token",
            },
          },
        } as RemoteClawConfig,
        expectedActions: ["send", "poll", "react", "delete", "edit", "topic-create", "topic-edit"],
        expectedCapabilities: ["interactive", "buttons"],
      },
    ],
  });
});
