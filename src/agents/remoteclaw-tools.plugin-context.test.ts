import { describe, expect, it, vi } from "vitest";

const resolvePluginToolsMock = vi.fn((params?: unknown) => {
  void params;
  return [];
});

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
