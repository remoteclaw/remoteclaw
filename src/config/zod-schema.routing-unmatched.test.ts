import { describe, expect, it } from "vitest";
import { RemoteClawSchema } from "./zod-schema.js";

describe("RemoteClawSchema routing.unmatched", () => {
  it("accepts omitted routing field", () => {
    expect(() =>
      RemoteClawSchema.parse({
        agents: { list: [{ id: "ops", workspace: "~/ops" }] },
      }),
    ).not.toThrow();
  });

  it("accepts routing.unmatched = 'reject'", () => {
    expect(() =>
      RemoteClawSchema.parse({
        agents: {
          list: [
            { id: "ops", workspace: "~/ops" },
            { id: "dev", workspace: "~/dev" },
          ],
        },
        routing: { unmatched: "reject" },
      }),
    ).not.toThrow();
  });

  it("accepts routing.unmatched = { agent: 'id' } when agent exists", () => {
    expect(() =>
      RemoteClawSchema.parse({
        agents: {
          list: [
            { id: "ops", workspace: "~/ops" },
            { id: "triage", workspace: "~/triage" },
          ],
        },
        routing: { unmatched: { agent: "triage" } },
      }),
    ).not.toThrow();
  });

  it("rejects routing.unmatched.agent referencing an unknown agent", () => {
    expect(() =>
      RemoteClawSchema.parse({
        agents: {
          list: [
            { id: "ops", workspace: "~/ops" },
            { id: "dev", workspace: "~/dev" },
          ],
        },
        routing: { unmatched: { agent: "nonexistent" } },
      }),
    ).toThrow(/Unknown agent id.*nonexistent/);
  });

  it("rejects routing.unmatched with extra fields", () => {
    expect(() =>
      RemoteClawSchema.parse({
        agents: { list: [{ id: "ops", workspace: "~/ops" }] },
        routing: { unmatched: { agent: "ops", extra: "nope" } },
      }),
    ).toThrow();
  });

  it("rejects routing with extra fields outside unmatched", () => {
    expect(() =>
      RemoteClawSchema.parse({
        agents: { list: [{ id: "ops", workspace: "~/ops" }] },
        routing: { unmatched: "reject", unknownField: "nope" },
      }),
    ).toThrow();
  });

  it("rejects routing.unmatched as an arbitrary string other than 'reject'", () => {
    expect(() =>
      RemoteClawSchema.parse({
        agents: { list: [{ id: "ops", workspace: "~/ops" }] },
        routing: { unmatched: "custom" },
      }),
    ).toThrow();
  });
});

describe("RemoteClawSchema bindings agent validation", () => {
  it("accepts binding referencing a configured agent", () => {
    expect(() =>
      RemoteClawSchema.parse({
        agents: { list: [{ id: "ops", workspace: "~/ops" }] },
        bindings: [
          {
            agentId: "ops",
            match: { channel: "telegram", peer: { kind: "direct", id: "+1555" } },
          },
        ],
      }),
    ).not.toThrow();
  });

  it("rejects binding referencing an unknown agent", () => {
    expect(() =>
      RemoteClawSchema.parse({
        agents: { list: [{ id: "ops", workspace: "~/ops" }] },
        bindings: [
          {
            agentId: "nonexistent",
            match: { channel: "telegram", peer: { kind: "direct", id: "+1555" } },
          },
        ],
      }),
    ).toThrow(/Unknown agent id.*nonexistent/);
  });

  it("rejects empty agents.list (parent #2308 contract)", () => {
    expect(() =>
      RemoteClawSchema.parse({
        agents: { list: [] },
      }),
    ).toThrow(/agents\.list must contain at least one entry/);
  });
});
