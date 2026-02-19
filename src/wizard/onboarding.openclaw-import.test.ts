import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { detectAndOfferOpenClawImport } from "./onboarding.openclaw-import.js";
import type { WizardPrompter, WizardSelectParams } from "./prompts.js";

type NoteMock = WizardPrompter["note"] & {
  mock: { calls: [message: string, title?: string][] };
};

function createNote(): NoteMock {
  return vi.fn(async (_message: string, _title?: string) => {}) as unknown as NoteMock;
}

function createPrompter(overrides?: Partial<WizardPrompter>): WizardPrompter {
  return {
    intro: vi.fn(async () => {}),
    outro: vi.fn(async () => {}),
    note: createNote(),
    select: vi.fn(async () => "fresh") as unknown as WizardPrompter["select"],
    multiselect: vi.fn(async () => []),
    text: vi.fn(async () => ""),
    confirm: vi.fn(async () => false),
    progress: vi.fn(() => ({ update: vi.fn(), stop: vi.fn() })),
    ...overrides,
  };
}

describe("detectAndOfferOpenClawImport", () => {
  let tmpHome: string;
  let env: NodeJS.ProcessEnv;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "remoteclaw-wizard-oc-"));
    env = { HOME: tmpHome };
  });

  afterEach(() => {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  function writeOpenClawConfig(config: Record<string, unknown>, dir?: string): string {
    const targetDir = dir ?? path.join(tmpHome, ".openclaw");
    fs.mkdirSync(targetDir, { recursive: true });
    const filePath = path.join(targetDir, "openclaw.json");
    fs.writeFileSync(filePath, JSON.stringify(config, null, 2), "utf-8");
    return filePath;
  }

  it("returns no-import when no OpenClaw config exists", async () => {
    const prompter = createPrompter();
    const result = await detectAndOfferOpenClawImport({
      opts: {},
      prompter,
      env,
    });

    expect(result.imported).toBe(false);
    expect(result.config).toBeNull();
    expect(prompter.note).not.toHaveBeenCalled();
    expect(prompter.select).not.toHaveBeenCalled();
  });

  it("returns no-import in non-interactive mode even when OpenClaw config exists", async () => {
    writeOpenClawConfig({ channels: { telegram: {} } });
    const prompter = createPrompter();

    const result = await detectAndOfferOpenClawImport({
      opts: { nonInteractive: true },
      prompter,
      env,
    });

    expect(result.imported).toBe(false);
    expect(result.config).toBeNull();
    expect(prompter.select).not.toHaveBeenCalled();
  });

  it("imports config when user selects 'Import config'", async () => {
    writeOpenClawConfig({
      channels: { telegram: { enabled: true } },
      agents: { list: [{ id: "main" }] },
    });

    const select = vi.fn(async () => "import") as unknown as WizardPrompter["select"];
    const note = createNote();
    const prompter = createPrompter({ select, note });

    const result = await detectAndOfferOpenClawImport({
      opts: {},
      prompter,
      env,
    });

    expect(result.imported).toBe(true);
    expect(result.config).toBeDefined();
    expect(result.config).toHaveProperty("channels");
    expect(result.config).toHaveProperty("agents");

    // Verify import report was shown
    expect(note.mock.calls.some((call) => call[1] === "Import complete")).toBe(true);
  });

  it("returns no-import when user selects 'Start fresh'", async () => {
    writeOpenClawConfig({ channels: { telegram: {} } });

    const select = vi.fn(async () => "fresh") as unknown as WizardPrompter["select"];
    const prompter = createPrompter({ select });

    const result = await detectAndOfferOpenClawImport({
      opts: {},
      prompter,
      env,
    });

    expect(result.imported).toBe(false);
    expect(result.config).toBeNull();
  });

  it("shows preview then imports when user selects preview then import", async () => {
    writeOpenClawConfig({
      channels: { telegram: {} },
      skills: { load: {} },
    });

    let callCount = 0;
    const select = vi.fn(async () => {
      callCount++;
      return callCount === 1 ? "preview" : "import";
    }) as unknown as WizardPrompter["select"];
    const note = createNote();
    const prompter = createPrompter({ select, note });

    const result = await detectAndOfferOpenClawImport({
      opts: {},
      prompter,
      env,
    });

    expect(result.imported).toBe(true);
    expect(result.config).toHaveProperty("channels");
    // skills should be dropped
    expect(result.config).not.toHaveProperty("skills");

    // Verify preview was shown before import
    const noteTitles = note.mock.calls.map((call) => call[1]);
    const previewIdx = noteTitles.indexOf("Import preview");
    const completeIdx = noteTitles.indexOf("Import complete");
    expect(previewIdx).toBeGreaterThanOrEqual(0);
    expect(completeIdx).toBeGreaterThan(previewIdx);
  });

  it("shows preview then starts fresh when user selects preview then fresh", async () => {
    writeOpenClawConfig({ channels: { telegram: {} } });

    let callCount = 0;
    const select = vi.fn(async () => {
      callCount++;
      return callCount === 1 ? "preview" : "fresh";
    }) as unknown as WizardPrompter["select"];
    const note = createNote();
    const prompter = createPrompter({ select, note });

    const result = await detectAndOfferOpenClawImport({
      opts: {},
      prompter,
      env,
    });

    expect(result.imported).toBe(false);
    expect(result.config).toBeNull();

    // Preview was shown
    const noteTitles = note.mock.calls.map((call) => call[1]);
    expect(noteTitles).toContain("Import preview");
    // But no "Import complete"
    expect(noteTitles).not.toContain("Import complete");
  });

  it("detects OpenClaw config via OPENCLAW_STATE_DIR env var", async () => {
    const customDir = path.join(tmpHome, "custom-openclaw-dir");
    writeOpenClawConfig({ channels: { discord: {} } }, customDir);

    const select = vi.fn(async () => "import") as unknown as WizardPrompter["select"];
    const prompter = createPrompter({ select });

    const result = await detectAndOfferOpenClawImport({
      opts: {},
      prompter,
      env: { ...env, OPENCLAW_STATE_DIR: customDir },
    });

    expect(result.imported).toBe(true);
    expect(result.config).toHaveProperty("channels");
  });

  it("prefers canonical path over OPENCLAW_STATE_DIR", async () => {
    // Write both canonical and custom
    writeOpenClawConfig({ channels: { telegram: {} } });
    const customDir = path.join(tmpHome, "custom-openclaw-dir");
    writeOpenClawConfig({ channels: { discord: {} } }, customDir);

    const select = vi.fn(async () => "import") as unknown as WizardPrompter["select"];
    const note = createNote();
    const prompter = createPrompter({ select, note });

    const result = await detectAndOfferOpenClawImport({
      opts: {},
      prompter,
      env: { ...env, OPENCLAW_STATE_DIR: customDir },
    });

    expect(result.imported).toBe(true);
    // Should have imported from canonical (~/.openclaw) which has telegram
    expect((result.config?.channels as Record<string, unknown>)?.telegram).toBeDefined();
  });

  it("shows env var reminder when OPENCLAW_* vars are set and user imports", async () => {
    writeOpenClawConfig({ channels: {} });

    const select = vi.fn(async () => "import") as unknown as WizardPrompter["select"];
    const note = createNote();
    const prompter = createPrompter({ select, note });

    const result = await detectAndOfferOpenClawImport({
      opts: {},
      prompter,
      env: {
        ...env,
        OPENCLAW_STATE_DIR: "/some/dir",
        OPENCLAW_GATEWAY_TOKEN: "tok",
      },
    });

    expect(result.imported).toBe(true);

    const envNote = note.mock.calls.find((call) => call[1] === "Environment variables");
    expect(envNote).toBeDefined();
    const envMessage = envNote![0];
    expect(envMessage).toContain("OPENCLAW_STATE_DIR");
    expect(envMessage).toContain("REMOTECLAW_STATE_DIR");
    expect(envMessage).toContain("OPENCLAW_GATEWAY_TOKEN");
    expect(envMessage).toContain("REMOTECLAW_GATEWAY_TOKEN");
  });

  it("does not show env var reminder when no OPENCLAW_* vars are set", async () => {
    writeOpenClawConfig({ channels: {} });

    const select = vi.fn(async () => "import") as unknown as WizardPrompter["select"];
    const note = createNote();
    const prompter = createPrompter({ select, note });

    await detectAndOfferOpenClawImport({ opts: {}, prompter, env });

    expect(note.mock.calls.every((call) => call[1] !== "Environment variables")).toBe(true);
  });

  it("does not show env var reminder when user starts fresh", async () => {
    writeOpenClawConfig({ channels: {} });

    const select = vi.fn(async () => "fresh") as unknown as WizardPrompter["select"];
    const note = createNote();
    const prompter = createPrompter({ select, note });

    await detectAndOfferOpenClawImport({
      opts: {},
      prompter,
      env: { ...env, OPENCLAW_STATE_DIR: "/some/dir" },
    });

    expect(note.mock.calls.every((call) => call[1] !== "Environment variables")).toBe(true);
  });

  it("drops skills, plugins, models, wizard, update sections", async () => {
    writeOpenClawConfig({
      channels: { telegram: {} },
      skills: { load: {} },
      plugins: { enabled: true },
      models: { defaults: {} },
      wizard: { lastRunAt: "2024" },
      update: { channel: "stable" },
    });

    const select = vi.fn(async () => "import") as unknown as WizardPrompter["select"];
    const prompter = createPrompter({ select });

    const result = await detectAndOfferOpenClawImport({
      opts: {},
      prompter,
      env,
    });

    expect(result.imported).toBe(true);
    expect(result.config).toHaveProperty("channels");
    expect(result.config).not.toHaveProperty("skills");
    expect(result.config).not.toHaveProperty("plugins");
    expect(result.config).not.toHaveProperty("models");
    expect(result.config).not.toHaveProperty("wizard");
    expect(result.config).not.toHaveProperty("update");
  });

  it("returns no-import when OpenClaw config file is invalid JSON", async () => {
    const dir = path.join(tmpHome, ".openclaw");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "openclaw.json"), "not json", "utf-8");

    const prompter = createPrompter();

    const result = await detectAndOfferOpenClawImport({
      opts: {},
      prompter,
      env,
    });

    expect(result.imported).toBe(false);
    expect(result.config).toBeNull();
  });

  it("shows detection note with shortened path", async () => {
    writeOpenClawConfig({ channels: {} });

    const select = vi.fn(async () => "fresh") as unknown as WizardPrompter["select"];
    const note = createNote();
    const prompter = createPrompter({ select, note });

    await detectAndOfferOpenClawImport({ opts: {}, prompter, env });

    const migrationNote = note.mock.calls.find((call) => call[1] === "OpenClaw migration");
    expect(migrationNote).toBeDefined();
    expect(migrationNote![0]).toContain("~/.openclaw/openclaw.json");
  });

  it("offers select prompt with three options", async () => {
    writeOpenClawConfig({ channels: {} });

    const select = vi.fn(async (params: WizardSelectParams) => {
      expect(params.message).toBe("Import OpenClaw config?");
      expect(params.options).toHaveLength(3);
      expect(params.options.map((o) => o.value)).toEqual(["import", "fresh", "preview"]);
      return "fresh";
    }) as unknown as WizardPrompter["select"];
    const prompter = createPrompter({ select });

    await detectAndOfferOpenClawImport({ opts: {}, prompter, env });
  });
});
