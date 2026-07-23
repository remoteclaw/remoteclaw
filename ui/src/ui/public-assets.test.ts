// Control UI tests cover public assets behavior.
import { describe, expect, it } from "vitest";
import { controlUiPublicAssetPath, inferControlUiPublicAssetPath } from "./public-assets.ts";

describe("controlUiPublicAssetPath", () => {
  it("resolves root-mounted public assets from the URL root", () => {
    expect(controlUiPublicAssetPath("favicon.svg", "")).toBe("/favicon.svg");
    expect(controlUiPublicAssetPath("manifest.webmanifest", null)).toBe("/manifest.webmanifest");
  });

  it("resolves base-mounted public assets under the configured base path", () => {
    expect(controlUiPublicAssetPath("favicon.svg", "/ui")).toBe("/ui/favicon.svg");
    expect(controlUiPublicAssetPath("sw.js", "/apps/remoteclaw/")).toBe("/apps/remoteclaw/sw.js");
  });
});

describe("inferControlUiPublicAssetPath", () => {
  it("uses the root for known nested routes without a configured base path", () => {
    expect(
      inferControlUiPublicAssetPath("manifest.webmanifest", { pathname: "/skills/workshop" }),
    ).toBe("/manifest.webmanifest");
  });

  it("infers base-mounted assets from nested routes", () => {
    expect(
      inferControlUiPublicAssetPath("sw.js", { pathname: "/remoteclaw/skills/workshop" }),
    ).toBe("/remoteclaw/sw.js");
  });

  it("prefers an explicit base path over pathname inference", () => {
    expect(
      inferControlUiPublicAssetPath("apple-touch-icon.png", {
        basePath: "/control/",
        pathname: "/skills/workshop",
      }),
    ).toBe("/control/apple-touch-icon.png");
  });
});
