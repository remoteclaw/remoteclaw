import { beforeEach, describe, expect, it, vi } from "vitest";

const loadConfigMock = vi.fn();
const loadRemoteClawPluginsMock = vi.fn();
let buildPluginStatusReport: typeof import("./status.js").buildPluginStatusReport;
let buildPluginInspectReport: typeof import("./status.js").buildPluginInspectReport;

vi.mock("../config/config.js", () => ({
  loadConfig: () => loadConfigMock(),
}));

vi.mock("./loader.js", () => ({
  loadRemoteClawPlugins: (...args: unknown[]) => loadRemoteClawPluginsMock(...args),
}));

vi.mock("../agents/agent-scope.js", () => ({
  resolveAgentWorkspaceDir: () => undefined,
  resolveDefaultAgentId: () => "default",
}));

vi.mock("../agents/workspace.js", () => ({
  resolveDefaultAgentWorkspaceDir: () => "/default-workspace",
}));

describe("buildPluginStatusReport", () => {
  beforeEach(async () => {
    vi.resetModules();
    loadConfigMock.mockReset();
    loadRemoteClawPluginsMock.mockReset();
    loadConfigMock.mockReturnValue({});
    loadRemoteClawPluginsMock.mockReturnValue({
      plugins: [],
      diagnostics: [],
      channels: [],
      providers: [],
      speechProviders: [],
      mediaUnderstandingProviders: [],
      imageGenerationProviders: [],
      webSearchProviders: [],
      tools: [],
      hooks: [],
      typedHooks: [],
      channelSetups: [],
      httpRoutes: [],
      gatewayHandlers: {},
      cliRegistrars: [],
      services: [],
      commands: [],
    });
    ({ buildPluginInspectReport, buildPluginStatusReport } = await import("./status.js"));
  });

  it("forwards an explicit env to plugin loading", () => {
    const env = { HOME: "/tmp/remoteclaw-home" } as NodeJS.ProcessEnv;

    buildPluginStatusReport({
      config: {},
      workspaceDir: "/workspace",
      env,
    });

    expect(loadRemoteClawPluginsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        config: {},
        workspaceDir: "/workspace",
        env,
      }),
    );
  });

  it("builds an inspect report with capability shape and policy", () => {
    loadConfigMock.mockReturnValue({
      plugins: {
        entries: {
          google: {
            hooks: { allowPromptInjection: false },
            subagent: {
              allowModelOverride: true,
              allowedModels: ["openai/gpt-5.4"],
            },
          },
        },
      },
    });
    loadRemoteClawPluginsMock.mockReturnValue({
      plugins: [
        {
          id: "google",
          name: "Google",
          description: "Google provider plugin",
          source: "/tmp/google/index.ts",
          origin: "bundled",
          enabled: true,
          status: "loaded",
          toolNames: [],
          hookNames: [],
          channelIds: [],
          providerIds: ["google"],
          speechProviderIds: [],
          mediaUnderstandingProviderIds: ["google"],
          imageGenerationProviderIds: ["google"],
          webSearchProviderIds: ["google"],
          gatewayMethods: [],
          cliCommands: [],
          services: [],
          commands: [],
          httpRoutes: 0,
          hookCount: 0,
          configSchema: false,
        },
      ],
      diagnostics: [{ level: "warn", pluginId: "google", message: "watch this seam" }],
      channels: [],
      channelSetups: [],
      providers: [],
      speechProviders: [],
      mediaUnderstandingProviders: [],
      imageGenerationProviders: [],
      webSearchProviders: [],
      tools: [],
      hooks: [],
      typedHooks: [
        {
          pluginId: "google",
          hookName: "before_agent_start",
          handler: () => undefined,
          source: "/tmp/google/index.ts",
        },
      ],
      httpRoutes: [],
      gatewayHandlers: {},
      cliRegistrars: [],
      services: [],
      commands: [],
    });

    const inspect = buildPluginInspectReport({ id: "google" });

    expect(inspect).not.toBeNull();
    expect(inspect?.shape).toBe("hybrid-capability");
    expect(inspect?.capabilityMode).toBe("hybrid");
    expect(inspect?.capabilities.map((entry) => entry.kind)).toEqual([
      "text-inference",
      "media-understanding",
      "image-generation",
      "web-search",
    ]);
    expect(inspect?.usesLegacyBeforeAgentStart).toBe(true);
    expect(inspect?.policy).toEqual({
      allowPromptInjection: false,
      allowModelOverride: true,
      allowedModels: ["openai/gpt-5.4"],
      hasAllowedModelsConfig: true,
    });
    expect(inspect?.diagnostics).toEqual([
      { level: "warn", pluginId: "google", message: "watch this seam" },
    ]);
  });
});
