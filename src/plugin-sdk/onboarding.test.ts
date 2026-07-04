import { describe, expect, it, vi } from "vitest";
import type { RemoteClawConfig } from "../config/config.js";
import type { WizardPrompter, WizardTextParams } from "../wizard/prompts.js";
import { promptAccountId } from "./onboarding.js";

const cfg = {} as RemoteClawConfig;
const listAccountIds = () => ["default", "pelykh"];

function makePrompter(overrides: Record<string, unknown>): WizardPrompter {
  return {
    intro: vi.fn(),
    outro: vi.fn(),
    note: vi.fn(async () => {}),
    select: vi.fn(),
    multiselect: vi.fn(),
    text: vi.fn(),
    confirm: vi.fn(),
    progress: vi.fn(),
    ...overrides,
  } as unknown as WizardPrompter;
}

describe("promptAccountId — duplicate account id guard (#586)", () => {
  it("rejects a new account id that collides with an existing one (normalized)", async () => {
    let validate: WizardTextParams["validate"];
    const prompter = makePrompter({
      select: vi.fn(async () => "__new__"),
      text: vi.fn(async (params: WizardTextParams) => {
        validate = params.validate;
        return "unique-new-id";
      }),
    });

    await promptAccountId({
      cfg,
      prompter,
      label: "Slack",
      listAccountIds,
      defaultAccountId: "default",
    });

    expect(validate).toBeDefined();
    // Exact and case/format variants of an existing id are rejected — the
    // pre-#586 validate only checked for non-empty input, so these leaked through
    // and silently overwrote the existing account.
    expect(validate?.("pelykh")).toMatch(/already exists/);
    expect(validate?.("Pelykh")).toMatch(/already exists/);
    expect(validate?.("default")).toMatch(/already exists/);
    // Empty input is still "Required".
    expect(validate?.("")).toBe("Required");
    // A genuinely new id passes validation.
    expect(validate?.("brand-new")).toBeUndefined();
  });

  it("returns the normalized id for a unique new account", async () => {
    const prompter = makePrompter({
      select: vi.fn(async () => "__new__"),
      text: vi.fn(async () => "BrandNew"),
    });

    const result = await promptAccountId({
      cfg,
      prompter,
      label: "Slack",
      listAccountIds,
      defaultAccountId: "default",
    });

    expect(result).toBe("brandnew");
  });

  it("returns an existing id directly without prompting for a new one", async () => {
    const textMock = vi.fn();
    const prompter = makePrompter({
      select: vi.fn(async () => "pelykh"),
      text: textMock,
    });

    const result = await promptAccountId({
      cfg,
      prompter,
      label: "Slack",
      listAccountIds,
      defaultAccountId: "default",
    });

    expect(result).toBe("pelykh");
    expect(textMock).not.toHaveBeenCalled();
  });
});
