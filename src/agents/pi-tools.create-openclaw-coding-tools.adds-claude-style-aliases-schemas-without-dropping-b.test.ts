import { describe, expect, it } from "vitest";
import "./test-helpers/fast-tool-stubs.js";
import { createOpenClawCodingTools } from "./pi-tools.js";

const defaultTools = createOpenClawCodingTools({ senderIsOwner: true });

describe("createOpenClawCodingTools", () => {
  it("preserves action enums in normalized schemas", () => {
    const toolNames = ["canvas", "nodes", "cron", "gateway", "message"];

    const collectActionValues = (schema: unknown, values: Set<string>): void => {
      if (!schema || typeof schema !== "object") {
        return;
      }
      const record = schema as Record<string, unknown>;
      if (typeof record.const === "string") {
        values.add(record.const);
      }
      if (Array.isArray(record.enum)) {
        for (const value of record.enum) {
          if (typeof value === "string") {
            values.add(value);
          }
        }
      }
      if (Array.isArray(record.anyOf)) {
        for (const variant of record.anyOf) {
          collectActionValues(variant, values);
        }
      }
    };

    for (const name of toolNames) {
      const tool = defaultTools.find((candidate) => candidate.name === name);
      expect(tool).toBeDefined();
      const parameters = tool?.parameters as {
        properties?: Record<string, unknown>;
      };
      const action = parameters.properties?.action as
        | { const?: unknown; enum?: unknown[] }
        | undefined;
      const values = new Set<string>();
      collectActionValues(action, values);

      const min =
        name === "gateway"
          ? 1
          : // Most tools expose multiple actions; keep this signal so schemas stay useful to models.
            2;
      expect(values.size).toBeGreaterThanOrEqual(min);
    }
  });
  it("provides top-level object schemas for all tools", () => {
    const tools = createOpenClawCodingTools();
    const offenders = tools
      .map((tool) => {
        const schema =
          tool.parameters && typeof tool.parameters === "object"
            ? (tool.parameters as Record<string, unknown>)
            : null;
        return {
          name: tool.name,
          type: schema?.type,
          keys: schema ? Object.keys(schema).toSorted() : null,
        };
      })
      .filter((entry) => entry.type !== "object");

    expect(offenders).toEqual([]);
  });
});
