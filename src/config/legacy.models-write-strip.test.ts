import { describe, expect, it } from "vitest";
import { applyLegacyMigrations } from "./legacy.js";
import { CommandsSchema } from "./zod-schema.session.js";

// The legacy key name is assembled from fragments so this test source carries no
// contiguous `models`+`Write` literal — the lint:no-models-write re-introduction gate
// greps src/config/ for that token (same self-flagging avoidance as
// check-no-lobster-leak building the lobster emoji from its codepoint). See #2758.
const LEGACY_KEY = ["models", "Write"].join("");

describe("legacy migration: gutted commands.models-write flag (#2758)", () => {
  it("strict CommandsSchema rejects the legacy key (so the migration is required)", () => {
    const result = CommandsSchema.safeParse({ text: true, [LEGACY_KEY]: true });
    expect(result.success).toBe(false);
  });

  it("strips the legacy key from raw config and records a change message", () => {
    const raw = { commands: { text: true, [LEGACY_KEY]: true } };
    const { next, changes } = applyLegacyMigrations(raw);
    expect(next).not.toBeNull();
    const commands = (next as Record<string, unknown>).commands as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(commands, LEGACY_KEY)).toBe(false);
    expect(commands.text).toBe(true);
    expect(changes.some((c) => c.includes(`commands.${LEGACY_KEY}`))).toBe(true);
  });

  it("migrated commands then loads cleanly under strict CommandsSchema", () => {
    const raw = { commands: { text: true, [LEGACY_KEY]: true } };
    const { next } = applyLegacyMigrations(raw);
    const commands = (next as Record<string, unknown>).commands;
    const result = CommandsSchema.safeParse(commands);
    expect(result.success).toBe(true);
  });

  it("is a no-op when the legacy key is absent", () => {
    const raw = { commands: { text: true } };
    const { next, changes } = applyLegacyMigrations(raw);
    expect(next).toBeNull();
    expect(changes.length).toBe(0);
  });
});
