/* @vitest-environment jsdom */

import { html, nothing, render } from "lit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getRenderedModalDialog,
  installDialogPolyfill,
  nextFrame,
} from "../test-helpers/modal-dialog.ts";
import type { RemoteClawModalDialog } from "./modal-dialog.ts";
import "./modal-dialog.ts";

let container: HTMLDivElement;
let restoreDialogPolyfill: () => void;

async function renderModal() {
  render(
    html`
      <remoteclaw-modal-dialog
        label="Confirm action"
        description="Review the operation before continuing."
      >
        <section>
          <h2 id="modal-title">Confirm action</h2>
          <p id="modal-description">Review the operation before continuing.</p>
          <button id="first-action">First</button>
          <button id="last-action">Last</button>
        </section>
      </remoteclaw-modal-dialog>
    `,
    container,
  );
  return await getRenderedModalDialog(container);
}

function expectShadowElement(modal: RemoteClawModalDialog, id: string): HTMLElement {
  const element = modal.shadowRoot?.getElementById(id);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Expected shadow element #${id}`);
  }
  return element;
}

describe("remoteclaw-modal-dialog", () => {
  beforeEach(() => {
    restoreDialogPolyfill = installDialogPolyfill();
    container = document.createElement("div");
    document.body.append(container);
  });

  afterEach(() => {
    render(nothing, container);
    container.remove();
    restoreDialogPolyfill();
    vi.restoreAllMocks();
  });

  it("opens a labelled modal dialog with an optional description", async () => {
    const { modal, dialog } = await renderModal();

    expect(dialog.open).toBe(true);
    expect(dialog.getAttribute("role")).toBe("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const labelId = dialog.getAttribute("aria-labelledby");
    const descriptionId = dialog.getAttribute("aria-describedby");
    expect(labelId).toBe("remoteclaw-modal-dialog-label");
    expect(descriptionId).toBe("remoteclaw-modal-dialog-description");
    expect(dialog.getRootNode()).toBe(modal.shadowRoot);
    expect(dialog.ownerDocument.querySelector(`#${labelId}`)).toBeNull();
    expect(expectShadowElement(modal, "remoteclaw-modal-dialog-label").textContent).toBe(
      "Confirm action",
    );
    expect(expectShadowElement(modal, "remoteclaw-modal-dialog-description").textContent).toBe(
      "Review the operation before continuing.",
    );
  });

  it("focuses the dialog container first", async () => {
    const { modal, dialog } = await renderModal();

    expect(modal.shadowRoot?.activeElement).toBe(dialog);
    expect(document.activeElement).not.toBe(container.querySelector("#first-action"));
  });

  it("cycles Tab and Shift+Tab inside focusable dialog content", async () => {
    const { dialog } = await renderModal();
    const first = container.querySelector<HTMLButtonElement>("#first-action");
    const last = container.querySelector<HTMLButtonElement>("#last-action");
    expect(first?.id).toBe("first-action");
    expect(last?.id).toBe("last-action");
    if (!first || !last) {
      throw new Error("expected modal focus trap actions");
    }

    last.focus();
    const tab = new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
      composed: true,
    });
    last.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);

    first.focus();
    const shiftTab = new KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
      composed: true,
    });
    first.dispatchEvent(shiftTab);
    expect(shiftTab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);
    expect(dialog.open).toBe(true);
  });

  it("emits modal-cancel on Escape", async () => {
    const { modal, dialog } = await renderModal();
    const onCancel = vi.fn();
    modal.addEventListener("modal-cancel", onCancel);

    dialog.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
        composed: true,
      }),
    );

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("restores focus when closed and removed", async () => {
    const returnTarget = document.createElement("button");
    returnTarget.textContent = "Return";
    document.body.append(returnTarget);
    returnTarget.focus();

    await renderModal();
    expect(document.activeElement).not.toBe(returnTarget);

    render(nothing, container);
    await nextFrame();

    expect(document.activeElement).toBe(returnTarget);
    returnTarget.remove();
  });
});
