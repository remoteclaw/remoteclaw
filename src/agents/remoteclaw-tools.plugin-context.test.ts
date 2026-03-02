import { describe, expect, it, vi } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock typing
const resolvePluginToolsMock = vi.fn((_params: any) => []);

vi.mock("../plugins/tools.js", () => ({
  resolvePluginTools: resolvePluginToolsMock,
}));

import { createRemoteClawTools } from "./remoteclaw-tools.js";

describe("createRemoteClawTools plugin context", () => {
  it("forwards trusted requester sender identity to plugin tool context", () => {
    createRemoteClawTools({
      config: {} as never,
      requesterSenderId: "trusted-sender",
      senderIsOwner: true,
    });

    expect(resolvePluginToolsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          requesterSenderId: "trusted-sender",
          senderIsOwner: true,
        }),
      }),
    );
  });
});
