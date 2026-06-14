import { render } from "lit";
import { describe, expect, it, vi } from "vitest";
import { renderConfig } from "./config.ts";

describe("config view", () => {
  const baseProps = () => ({
    raw: "{\n}\n",
    originalRaw: "{\n}\n",
    valid: true,
    issues: [],
    loading: false,
    saving: false,
    applying: false,
    updating: false,
    connected: true,
    schema: {
      type: "object",
      properties: {},
    },
    schemaLoading: false,
    uiHints: {},
    formMode: "form" as const,
    formValue: {},
    originalValue: {},
    searchQuery: "",
    activeSection: null,
    activeSubsection: null,
    onRawChange: vi.fn(),
    onFormModeChange: vi.fn(),
    onFormPatch: vi.fn(),
    onSearchChange: vi.fn(),
    onSectionChange: vi.fn(),
    onReload: vi.fn(),
    onSave: vi.fn(),
    onApply: vi.fn(),
    onUpdate: vi.fn(),
    onSubsectionChange: vi.fn(),
  });

  function findActionButtons(container: HTMLElement): {
    saveButton?: HTMLButtonElement;
    applyButton?: HTMLButtonElement;
  } {
    const buttons = Array.from(container.querySelectorAll("button"));
    return {
      saveButton: buttons.find((btn) => btn.textContent?.trim() === "Save"),
      applyButton: buttons.find((btn) => btn.textContent?.trim() === "Apply"),
    };
  }

  it("allows save when form is unsafe", () => {
    const container = document.createElement("div");

    const renderCase = (overrides: Partial<ConfigProps>) =>
      render(renderConfig({ ...baseProps(), ...overrides }), container);

    renderCase({
      schema: {
        type: "object",
        properties: {
          mixed: {
            anyOf: [{ type: "string" }, { type: "object", properties: {} }],
          },
        },
      },
      schemaLoading: false,
      uiHints: {},
      formMode: "form",
      formValue: { mixed: "x" },
    });
    let { saveButton, applyButton } = findActionButtons(container);
    expect(saveButton).not.toBeUndefined();
    expect(saveButton?.disabled).toBe(false);
    expect(applyButton?.disabled).toBe(false);

    renderCase({
      schema: null,
      formMode: "form",
      formValue: { gateway: { mode: "local" } },
      originalValue: {},
    });
    ({ saveButton, applyButton } = findActionButtons(container));
    expect(saveButton).not.toBeUndefined();
    expect(saveButton?.disabled).toBe(true);
    expect(applyButton?.disabled).toBe(true);

    renderCase({
      formMode: "raw",
      raw: "{\n}\n",
      originalRaw: "{\n}\n",
    });
    ({ saveButton, applyButton } = findActionButtons(container));
    expect(saveButton).not.toBeUndefined();
    expect(applyButton).not.toBeUndefined();
    expect(saveButton?.disabled).toBe(true);
    expect(applyButton?.disabled).toBe(true);

    renderCase({
      formMode: "raw",
      raw: '{\n  gateway: { mode: "local" }\n}\n',
      originalRaw: "{\n}\n",
    });
    ({ saveButton, applyButton } = findActionButtons(container));
    expect(saveButton).not.toBeUndefined();
    expect(applyButton).not.toBeUndefined();
    expect(saveButton?.disabled).toBe(false);
    expect(applyButton?.disabled).toBe(false);
  });

  it("switches mode via the sidebar toggle", () => {
    const container = document.createElement("div");
    const onFormModeChange = vi.fn();
    render(
      renderConfig({
        ...baseProps(),
        onFormModeChange,
      }),
      container,
    );

    const btn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "Raw",
    );
    expect(btn).toBeTruthy();
    btn?.click();
    expect(onFormModeChange).toHaveBeenCalledWith("raw");
  });

  it("switches sections from the sidebar", () => {
    const container = document.createElement("div");
    const onSectionChange = vi.fn();
    render(
      renderConfig({
        ...baseProps(),
        onSectionChange,
        schema: {
          type: "object",
          properties: {
            gateway: { type: "object", properties: {} },
            agents: { type: "object", properties: {} },
          },
        },
      }),
      container,
    );

    const tabs = Array.from(container.querySelectorAll(".config-top-tabs__tab")).map((tab) =>
      tab.textContent?.trim(),
    );
    expect(tabs).toContain("Settings");
    expect(tabs).toContain("Agents");
    expect(tabs).toContain("Gateway");

    const btn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "Gateway",
    );
    expect(btn).toBeTruthy();
    btn?.click();
    expect(onSectionChange).toHaveBeenCalledWith("gateway");
  });

  it("resets config content scroll when switching top-tab sections", async () => {
    const { container } = renderConfigView({
      activeSection: "channels",
      navRootLabel: "Communication",
      includeSections: ["channels", "messages"],
      schema: {
        type: "object",
        properties: {
          channels: {
            type: "object",
            properties: {
              telegram: { type: "string" },
            },
          },
          messages: {
            type: "object",
            properties: {
              inbox: { type: "string" },
            },
          },
        },
      },
      formValue: {
        channels: { telegram: "on" },
        messages: { inbox: "smart" },
      },
      originalValue: {
        channels: { telegram: "on" },
        messages: { inbox: "smart" },
      },
    });

    const content = container.querySelector<HTMLElement>(".config-content");
    expect(content).toBeTruthy();
    if (!content) {
      return;
    }
    content.scrollTop = 280;
    content.scrollLeft = 24;
    content.scrollTo = vi.fn(({ top, left }: { top?: number; left?: number }) => {
      content.scrollTop = top ?? content.scrollTop;
      content.scrollLeft = left ?? content.scrollLeft;
    }) as typeof content.scrollTo;

    const messagesButton = Array.from(container.querySelectorAll("button")).find(
      (btn) => btn.textContent?.trim() === "Messages",
    );
    expect(messagesButton).toBeTruthy();

    messagesButton?.click();
    await Promise.resolve();

    expect(content.scrollTo).toHaveBeenCalledOnce();
    expect(content.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: "auto" });
    expect(content.scrollTop).toBe(0);
    expect(content.scrollLeft).toBe(0);
  });

  it("renders and wires the search field controls", () => {
    const container = document.createElement("div");
    const onSearchChange = vi.fn();
    render(
      renderConfig({
        ...baseProps(),
        searchQuery: "gateway",
        onSearchChange,
      }),
      container,
    );

    const icon = container.querySelector<SVGElement>(".config-search__icon");
    expect(icon).not.toBeNull();
    expect(icon?.closest(".config-search__input-row")).not.toBeNull();

    const input = container.querySelector(".config-search__input");
    expect(input).not.toBeNull();
    if (!input) {
      return;
    }
    (input as HTMLInputElement).value = "gateway";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(onSearchChange).toHaveBeenCalledWith("gateway");
  });

  it("shows all tag options in compact tag picker", () => {
    const container = document.createElement("div");
    render(renderConfig(baseProps()), container);

    const options = Array.from(container.querySelectorAll(".config-search__tag-option")).map(
      (option) => option.textContent?.trim(),
    );
    expect(options).toContain("tag:security");
    expect(options).toContain("tag:advanced");
    expect(options).toHaveLength(15);
  });

  it("updates search query when toggling a tag option", () => {
    const container = document.createElement("div");
    const onSearchChange = vi.fn();
    render(
      renderConfig({
        ...baseProps(),
        onSearchChange,
      }),
      container,
    );

    const option = container.querySelector<HTMLButtonElement>(
      '.config-search__tag-option[data-tag="security"]',
    );
    expect(option).toBeTruthy();
    option?.click();
    expect(onSearchChange).toHaveBeenCalledWith("tag:security");
  });
});
