import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerFeishuChatTools } from "./chat.js";

const createFeishuClientMock = vi.hoisted(() => vi.fn());
const chatGetMock = vi.hoisted(() => vi.fn());
const chatMembersGetMock = vi.hoisted(() => vi.fn());
const contactUserGetMock = vi.hoisted(() => vi.fn());

vi.mock("./client.js", () => ({
  createFeishuClient: createFeishuClientMock,
}));

describe("registerFeishuChatTools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createFeishuClientMock.mockReturnValue({
      im: {
        chat: { get: chatGetMock },
        chatMembers: { get: chatMembersGetMock },
      },
      contact: {
        user: { get: contactUserGetMock },
      },
    });
  });

  it("registers feishu_chat and handles info/members actions", async () => {
    const registerTool = vi.fn();
    registerFeishuChatTools({
      config: {
        channels: {
          feishu: {
            enabled: true,
            appId: "app_id",
            appSecret: "app_secret", // pragma: allowlist secret
            tools: { chat: true },
          },
        },
      } as any,
      logger: { debug: vi.fn(), info: vi.fn() } as any,
      registerTool,
    } as any);

    expect(registerTool).toHaveBeenCalledTimes(1);
    const tool = registerTool.mock.calls[0]?.[0];
    expect(tool?.name).toBe("feishu_chat");

    chatGetMock.mockResolvedValueOnce({
      code: 0,
      data: { name: "group name", user_count: 3 },
    });
    const infoResult = await tool.execute("tc_1", { action: "info", chat_id: "oc_1" });
    expect(infoResult.details).toEqual({
      chat_id: "oc_1",
      name: "group name",
      description: undefined,
      owner_id: undefined,
      tenant_key: undefined,
      user_count: 3,
      chat_mode: undefined,
      chat_type: undefined,
      join_message_visibility: undefined,
      leave_message_visibility: undefined,
      membership_approval: undefined,
      moderation_permission: undefined,
      avatar: undefined,
    });

    chatMembersGetMock.mockResolvedValueOnce({
      code: 0,
      data: {
        has_more: false,
        page_token: "",
        items: [{ member_id: "ou_1", name: "member1", member_id_type: "open_id" }],
      },
    });
    const membersResult = await tool.execute("tc_2", { action: "members", chat_id: "oc_1" });
    expect(membersResult.details).toEqual({
      chat_id: "oc_1",
      has_more: false,
      page_token: "",
      members: [
        {
          member_id: "ou_1",
          name: "member1",
          tenant_key: undefined,
          member_id_type: "open_id",
        },
      ],
    });

    contactUserGetMock.mockResolvedValueOnce({
      code: 0,
      data: {
        user: {
          open_id: "ou_1",
          name: "member1",
          email: "member1@example.com",
          department_ids: ["od_1"],
        },
      },
    });
    const memberInfoResult = await tool.execute("tc_3", {
      action: "member_info",
      member_id: "ou_1",
    });
    expect(memberInfoResult.details).toEqual({
      member_id: "ou_1",
      member_id_type: "open_id",
      open_id: "ou_1",
      user_id: undefined,
      union_id: undefined,
      name: "member1",
      en_name: undefined,
      nickname: undefined,
      email: "member1@example.com",
      enterprise_email: undefined,
      mobile: undefined,
      mobile_visible: undefined,
      status: undefined,
      avatar: undefined,
      department_ids: ["od_1"],
      department_path: undefined,
      leader_user_id: undefined,
      city: undefined,
      country: undefined,
      work_station: undefined,
      join_time: undefined,
      is_tenant_manager: undefined,
      employee_no: undefined,
      employee_type: undefined,
      description: undefined,
      job_title: undefined,
      geo: undefined,
    });
  });

  it("skips registration when chat tool is disabled", () => {
    const registerTool = vi.fn();
    registerFeishuChatTools({
      config: {
        channels: {
          feishu: {
            enabled: true,
            appId: "app_id",
            appSecret: "app_secret", // pragma: allowlist secret
            tools: { chat: false },
          },
        },
      } as any,
      logger: { debug: vi.fn(), info: vi.fn() } as any,
      registerTool,
    } as any);
    expect(registerTool).not.toHaveBeenCalled();
  });
});
