import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RemoteClawConfig } from "../config/config.js";
import { collectEnabledInsecureOrDangerousFlags } from "./dangerous-config-flags.js";

const { resolvePluginConfigContractsByIdMock } = vi.hoisted(() => ({
  resolvePluginConfigContractsByIdMock: vi.fn(),
}));

vi.mock("../plugins/config-contracts.js", () => ({
  collectPluginConfigContractMatches: ({
    pathPattern,
    root,
  }: {
    pathPattern: string;
    root: Record<string, unknown>;
  }) => (Object.hasOwn(root, pathPattern) ? [{ path: pathPattern, value: root[pathPattern] }] : []),
  resolvePluginConfigContractsById: resolvePluginConfigContractsByIdMock,
}));

function asConfig(value: unknown): RemoteClawConfig {
  return value as RemoteClawConfig;
}

describe("collectEnabledInsecureOrDangerousFlags", () => {
  beforeEach(() => {
    resolvePluginConfigContractsByIdMock.mockReset();
    resolvePluginConfigContractsByIdMock.mockReturnValue(new Map());
  });

  it("collects manifest-declared dangerous plugin config values", () => {
    resolvePluginConfigContractsByIdMock.mockReturnValue(
      new Map([
        [
          "acpx",
          {
            configContracts: {
              dangerousFlags: [{ path: "permissionMode", equals: "approve-all" }],
            },
          },
        ],
      ]),
    );

    expect(
      collectEnabledInsecureOrDangerousFlags(
        asConfig({
          plugins: {
            entries: {
              acpx: {
                config: {
                  permissionMode: "approve-all",
                },
              },
            },
          },
        }),
      ),
    ).toContain("plugins.entries.acpx.config.permissionMode=approve-all");
  });

  it("ignores plugin config values that are not declared as dangerous", () => {
    resolvePluginConfigContractsByIdMock.mockReturnValue(
      new Map([
        [
          "other",
          {
            configContracts: {
              dangerousFlags: [{ path: "mode", equals: "danger" }],
            },
          },
        ],
      ]),
    );

    expect(
      collectEnabledInsecureOrDangerousFlags(
        asConfig({
          plugins: {
            entries: {
              other: {
                config: {
                  mode: "safe",
                },
              },
            },
          },
        }),
      ),
    ).toStrictEqual([]);
  });
});
