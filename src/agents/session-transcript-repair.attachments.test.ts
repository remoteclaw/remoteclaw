import { describe, it, expect } from "vitest";
import type { AgentMessage } from "./agent-types.js";
import { sanitizeToolCallInputs } from "./session-transcript-repair.js";
import { castAgentMessage, castAgentMessages } from "./test-helpers/agent-message-fixtures.js";

function mkSessionsSpawnToolCall(content: string): AgentMessage {
  return castAgentMessage({
    role: "assistant",
    content: [
      {
        type: "toolCall",
        id: "call_1",
        name: "sessions_spawn",
        arguments: {
          task: "do thing",
          attachments: [
            {
              name: "README.md",
              encoding: "utf8",
              content,
            },
          ],
        },
      },
    ],
    timestamp: 0,
  });
}

describe("sanitizeToolCallInputs redacts sessions_spawn attachments", () => {
  it("replaces attachments[].content with __REMOTECLAW_REDACTED__", () => {
    const secret = "SUPER_SECRET_SHOULD_NOT_PERSIST"; // pragma: allowlist secret
    const input = [mkSessionsSpawnToolCall(secret)];
    const out = sanitizeToolCallInputs(input);
    expect(out).toStrictEqual([
      {
        role: "assistant",
        content: [
          {
            type: "toolCall",
            id: "call_1",
            name: "sessions_spawn",
            arguments: {
              task: "do thing",
              attachments: [
                {
                  name: "README.md",
                  encoding: "utf8",
                  content: "__REMOTECLAW_REDACTED__",
                },
              ],
            },
          },
        ],
        timestamp: 0,
      },
    ]);
    expect(JSON.stringify(out)).not.toContain(secret);
  });

  it("redacts attachments content from tool input payloads too", () => {
    const secret = "INPUT_SECRET_SHOULD_NOT_PERSIST"; // pragma: allowlist secret
    const input = castAgentMessages([
      {
        role: "assistant",
        content: [
          {
            type: "toolUse",
            id: "call_2",
            name: "sessions_spawn",
            input: {
              task: "do thing",
              attachments: [{ name: "x.txt", content: secret }],
            },
          },
        ],
      },
    ]);

    const out = sanitizeToolCallInputs(input);
    expect(out).toStrictEqual([
      {
        role: "assistant",
        content: [
          {
            type: "toolUse",
            id: "call_2",
            name: "sessions_spawn",
            input: {
              task: "do thing",
              attachments: [
                {
                  name: "x.txt",
                  content: "__REMOTECLAW_REDACTED__",
                },
              ],
            },
          },
        ],
      },
    ]);
    expect(JSON.stringify(out)).not.toContain(secret);
  });
});
