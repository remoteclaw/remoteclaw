import { beforeAll, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import "../styles.css";
import type { RemoteClawApp } from "./app.ts";
import { mountApp, registerAppMountHooks } from "./test-helpers/app-mount.ts";

// Computed-style smoke tests: defense-in-depth against the regression class
// demonstrated by #2517 — the production class is defined and renders, but
// structural wrappers are missing so the shell grid places the sidebar in
// the wrong cell, causing nav content to escape the visible area. The
// class-instance smoke tests (#2495 / #2496 in app.smoke.test.ts) assert
// every required field is initialized; these tests assert the rendered DOM
// has the expected layout dimensions on key structural elements.
//
// Runs in browser-mode Vitest (ui/vitest.config.ts via
// @vitest/browser-playwright) — real CSS is applied and
// getBoundingClientRect returns real layout values. The default test
// viewport is mobile-portrait (414x896), which triggers mobile breakpoints
// (@media max-width: 1100px) that hide the sidebar. These tests run at a
// desktop viewport so the #2517 regression class — which manifests only
// when the desktop grid layout applies — is observable.

const DESKTOP_WIDTH = 1280;
const DESKTOP_HEIGHT = 720;

registerAppMountHooks();

beforeAll(async () => {
  await page.viewport(DESKTOP_WIDTH, DESKTOP_HEIGHT);
});

async function waitForLayout(app: RemoteClawApp): Promise<void> {
  await app.updateComplete;
  // Two rAFs: first for Lit commit, second for layout flush after style apply.
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

describe("RemoteClawApp — computed-style smoke", () => {
  it("sidebar fits within viewport (not expanded beyond grid cell)", async () => {
    const app = mountApp("/chat");
    await waitForLayout(app);

    const sidebar = app.querySelector(".sidebar");
    expect(sidebar, ".sidebar not found in rendered DOM").not.toBeNull();

    const rect = sidebar!.getBoundingClientRect();
    // The shell grid should constrain the sidebar to the viewport height
    // (minus the topbar). Without the `.shell-nav` wrapper and internal
    // `.sidebar-shell` / `.sidebar-nav` structure (#2517 regression shape),
    // the sidebar lands outside its named grid-area and expands to fit all
    // nav content — producing a height far larger than the viewport.
    expect(rect.height, "sidebar must fit within the viewport").toBeLessThanOrEqual(
      window.innerHeight,
    );
    expect(rect.height, "sidebar collapsed to zero height").toBeGreaterThan(300);
    expect(rect.width, "sidebar collapsed to zero width").toBeGreaterThan(0);
  });

  it("topbar-status renders with non-zero width", async () => {
    const app = mountApp("/chat");
    await waitForLayout(app);

    const status = app.querySelector(".topbar-status");
    expect(status, ".topbar-status not found in rendered DOM").not.toBeNull();
    expect(
      status!.getBoundingClientRect().width,
      ".topbar-status collapsed to zero width",
    ).toBeGreaterThan(0);
  });

  it("all nav-section group headers are visible inside the sidebar", async () => {
    const app = mountApp("/chat");
    await waitForLayout(app);

    const sidebar = app.querySelector(".sidebar");
    expect(sidebar, ".sidebar not found in rendered DOM").not.toBeNull();
    const sidebarRect = sidebar!.getBoundingClientRect();

    const groups = app.querySelectorAll(".nav-section");
    // TAB_GROUPS (chat/control/agent/settings = 4) + resources static = 5.
    expect(groups.length, "unexpected .nav-section count").toBeGreaterThanOrEqual(4);

    for (const group of groups) {
      const rect = group.getBoundingClientRect();
      expect(rect.height, ".nav-section clipped to zero height").toBeGreaterThan(0);
      // Group HEADER must be within sidebar bounds — catches the #2517 shape
      // where nav-sections escape to negative `top` coordinates because the
      // sidebar landed in the wrong grid cell. 1px tolerance accommodates
      // subpixel layout rounding in different browser versions.
      const headerLabel = group.querySelector(".nav-section__label");
      if (headerLabel) {
        const headerRect = headerLabel.getBoundingClientRect();
        expect(
          headerRect.top,
          ".nav-section header positioned above sidebar (sidebar in wrong grid cell?)",
        ).toBeGreaterThanOrEqual(sidebarRect.top - 1);
        expect(
          headerRect.top,
          ".nav-section header positioned below sidebar (sidebar height wrong?)",
        ).toBeLessThanOrEqual(sidebarRect.bottom + 1);
      }
    }
  });

  it("chat panel renders with non-zero area on chat tab", async () => {
    const app = mountApp("/chat");
    await waitForLayout(app);

    const chat = app.querySelector("section.chat");
    expect(chat, "section.chat not found on chat tab").not.toBeNull();

    const rect = chat!.getBoundingClientRect();
    // Conservative thresholds: `mountApp` no-ops the WebSocket connect, so the
    // chat renders in its disconnected state (smaller than a live-connected
    // view). 50px catches "zero-height / not rendered" regressions while
    // remaining robust across viewports and connection states.
    expect(rect.height, "chat panel has zero height").toBeGreaterThan(50);
    expect(rect.width, "chat panel has zero width").toBeGreaterThan(50);
  });
});
