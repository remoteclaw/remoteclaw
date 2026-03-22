import { describe, expect, it } from "vitest";
import { formatPluginSourceForTable } from "./source-display.js";

describe("formatPluginSourceForTable", () => {
  it("shortens bundled plugin sources under the stock root", () => {
    const out = formatPluginSourceForTable(
      {
        origin: "bundled",
        source: "/opt/homebrew/lib/node_modules/remoteclaw/extensions/bluebubbles/index.ts",
      },
      {
        stock: "/opt/homebrew/lib/node_modules/remoteclaw/extensions",
        global: "/Users/x/.remoteclaw/extensions",
        workspace: "/Users/x/ws/.remoteclaw/extensions",
      },
    );
    expect(out.value).toBe("stock:bluebubbles/index.ts");
    expect(out.rootKey).toBe("stock");
  });

  it("shortens workspace plugin sources under the workspace root", () => {
    const out = formatPluginSourceForTable(
      {
        origin: "workspace",
        source: "/Users/x/ws/.remoteclaw/extensions/matrix/index.ts",
      },
      {
        stock: "/opt/homebrew/lib/node_modules/remoteclaw/extensions",
        global: "/Users/x/.remoteclaw/extensions",
        workspace: "/Users/x/ws/.remoteclaw/extensions",
      },
    );
    expect(out.value).toBe("workspace:matrix/index.ts");
    expect(out.rootKey).toBe("workspace");
  });

  it("shortens global plugin sources under the global root", () => {
    const out = formatPluginSourceForTable(
      {
        origin: "global",
        source: "/Users/x/.remoteclaw/extensions/zalo/index.js",
      },
      {
        stock: "/opt/homebrew/lib/node_modules/remoteclaw/extensions",
        global: "/Users/x/.remoteclaw/extensions",
        workspace: "/Users/x/ws/.remoteclaw/extensions",
      },
    );
    expect(out.value).toBe("global:zalo/index.js");
    expect(out.rootKey).toBe("global");
  });

  it("resolves source roots from an explicit env override", () => {
    const ignoredHome = path.resolve(path.sep, "tmp", "ignored-home");
    const homeDir = path.resolve(path.sep, "tmp", "openclaw-home");
    const roots = withEnv(
      {
        OPENCLAW_BUNDLED_PLUGINS_DIR: path.join(ignoredHome, "ignored-bundled"),
        OPENCLAW_STATE_DIR: path.join(ignoredHome, "ignored-state"),
        OPENCLAW_HOME: undefined,
        HOME: ignoredHome,
      },
      () =>
        resolvePluginSourceRoots({
          env: {
            ...process.env,
            HOME: homeDir,
            OPENCLAW_HOME: undefined,
            OPENCLAW_BUNDLED_PLUGINS_DIR: "~/bundled",
            OPENCLAW_STATE_DIR: "~/state",
          },
          workspaceDir: "~/ws",
        }),
    );

    expect(roots).toEqual({
      stock: path.join(homeDir, "bundled"),
      global: path.join(homeDir, "state", "extensions"),
      workspace: path.join(homeDir, "ws", ".openclaw", "extensions"),
    });
  });
});
