import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { clearPluginManifestRegistryCache } from "../plugins/manifest-registry.js";
import { validateConfigObjectWithPlugins } from "./config.js";

async function chmodSafeDir(dir: string) {
  if (process.platform === "win32") {
    return;
  }
  await fs.chmod(dir, 0o755);
}

async function mkdirSafe(dir: string) {
  await fs.mkdir(dir, { recursive: true });
  await chmodSafeDir(dir);
}

async function writePluginFixture(params: {
  dir: string;
  id: string;
  schema: Record<string, unknown>;
  channels?: string[];
}) {
  await mkdirSafe(params.dir);
  await fs.writeFile(
    path.join(params.dir, "index.js"),
    `export default { id: "${params.id}", register() {} };`,
    "utf-8",
  );
  const manifest: Record<string, unknown> = {
    id: params.id,
    configSchema: params.schema,
  };
  if (params.channels) {
    manifest.channels = params.channels;
  }
  await fs.writeFile(
    path.join(params.dir, "remoteclaw.plugin.json"),
    JSON.stringify(manifest, null, 2),
    "utf-8",
  );
}

describe("config plugin validation", () => {
  const previousUmask = process.umask(0o022);
  let fixtureRoot = "";
  let suiteHome = "";
  let badPluginDir = "";
  let enumPluginDir = "";
  let bluebubblesPluginDir = "";
  let voiceCallSchemaPluginDir = "";
  const envSnapshot = {
    HOME: process.env.HOME,
    REMOTECLAW_HOME: process.env.REMOTECLAW_HOME,
    REMOTECLAW_STATE_DIR: process.env.REMOTECLAW_STATE_DIR,
    REMOTECLAW_PLUGIN_MANIFEST_CACHE_MS: process.env.REMOTECLAW_PLUGIN_MANIFEST_CACHE_MS,
  };

  const validateInSuite = (raw: unknown) => validateConfigObjectWithPlugins(raw);

  beforeAll(async () => {
    fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), "remoteclaw-config-plugin-validation-"));
    await chmodSafeDir(fixtureRoot);
    suiteHome = path.join(fixtureRoot, "home");
    await mkdirSafe(suiteHome);
    badPluginDir = path.join(suiteHome, "bad-plugin");
    enumPluginDir = path.join(suiteHome, "enum-plugin");
    bluebubblesPluginDir = path.join(suiteHome, "bluebubbles-plugin");
    await writePluginFixture({
      dir: enumPluginDir,
      id: "enum-plugin",
      schema: {
        type: "object",
        properties: {
          fileFormat: {
            type: "string",
            enum: ["markdown", "html"],
          },
        },
        required: ["fileFormat"],
      },
    });
    await writePluginFixture({
      dir: bluebubblesPluginDir,
      id: "bluebubbles-plugin",
      channels: ["bluebubbles"],
      schema: { type: "object" },
    });
    voiceCallSchemaPluginDir = path.join(suiteHome, "voice-call-schema-plugin");
    const voiceCallManifestPath = path.join(
      process.cwd(),
      "extensions",
      "voice-call",
      "remoteclaw.plugin.json",
    );
    const voiceCallManifest = JSON.parse(await fs.readFile(voiceCallManifestPath, "utf-8")) as {
      configSchema?: Record<string, unknown>;
    };
    if (!voiceCallManifest.configSchema) {
      throw new Error("voice-call manifest missing configSchema");
    }
    await writePluginFixture({
      dir: voiceCallSchemaPluginDir,
      id: "voice-call-schema-fixture",
      schema: voiceCallManifest.configSchema,
    });
    process.env.HOME = suiteHome;
    delete process.env.REMOTECLAW_HOME;
    process.env.REMOTECLAW_STATE_DIR = path.join(suiteHome, ".remoteclaw");
    process.env.REMOTECLAW_PLUGIN_MANIFEST_CACHE_MS = "10000";
    clearPluginManifestRegistryCache();
    // Warm the plugin manifest cache once so path-based validations can reuse
    // parsed manifests across test cases.
    validateInSuite({
      plugins: {
        enabled: false,
        load: { paths: [badPluginDir, bluebubblesPluginDir, voiceCallSchemaPluginDir] },
      },
    });
  });

  afterAll(async () => {
    clearPluginManifestRegistryCache();
    if (envSnapshot.HOME === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = envSnapshot.HOME;
    }
    if (envSnapshot.REMOTECLAW_HOME === undefined) {
      delete process.env.REMOTECLAW_HOME;
    } else {
      process.env.REMOTECLAW_HOME = envSnapshot.REMOTECLAW_HOME;
    }
    if (envSnapshot.REMOTECLAW_STATE_DIR === undefined) {
      delete process.env.REMOTECLAW_STATE_DIR;
    } else {
      process.env.REMOTECLAW_STATE_DIR = envSnapshot.REMOTECLAW_STATE_DIR;
    }
    if (envSnapshot.REMOTECLAW_PLUGIN_MANIFEST_CACHE_MS === undefined) {
      delete process.env.REMOTECLAW_PLUGIN_MANIFEST_CACHE_MS;
    } else {
      process.env.REMOTECLAW_PLUGIN_MANIFEST_CACHE_MS =
        envSnapshot.REMOTECLAW_PLUGIN_MANIFEST_CACHE_MS;
    }
    await fs.rm(fixtureRoot, { recursive: true, force: true });
    process.umask(previousUmask);
  });

  it("reports missing plugin refs across load paths, entries, and allowlist surfaces", async () => {
    const missingPath = path.join(suiteHome, "missing-plugin-dir");
    const res = validateInSuite({
      agents: { list: [{ id: "pi", workspace: "/tmp/test-workspace" }] },
      plugins: {
        enabled: false,
        load: { paths: [missingPath] },
        entries: { "missing-plugin": { enabled: true } },
        allow: ["missing-allow"],
        deny: ["missing-deny"],
      },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(
        res.issues.some(
          (issue) =>
            issue.path === "plugins.load.paths" && issue.message.includes("plugin path not found"),
        ),
      ).toBe(true);
      expect(res.issues).toEqual(
        expect.arrayContaining([
          { path: "plugins.allow", message: "plugin not found: missing-allow" },
          { path: "plugins.deny", message: "plugin not found: missing-deny" },
        ]),
      );
      expect(res.warnings).toContainEqual({
        path: "plugins.entries.missing-plugin",
        message:
          "plugin not found: missing-plugin (stale config entry ignored; remove it from plugins config)",
      });
    }
  });

  it("warns for removed legacy plugin ids instead of failing validation", async () => {
    const removedId = "google-antigravity-auth";
    const res = validateInSuite({
      agents: { list: [{ id: "pi", workspace: "/tmp/test-workspace" }] },
      plugins: {
        enabled: false,
        entries: { [removedId]: { enabled: true } },
        allow: [removedId],
        deny: [removedId],
      },
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.warnings).toEqual(
        expect.arrayContaining([
          {
            path: `plugins.entries.${removedId}`,
            message:
              "plugin removed: google-antigravity-auth (stale config entry ignored; remove it from plugins config)",
          },
          {
            path: "plugins.allow",
            message:
              "plugin removed: google-antigravity-auth (stale config entry ignored; remove it from plugins config)",
          },
          {
            path: "plugins.deny",
            message:
              "plugin removed: google-antigravity-auth (stale config entry ignored; remove it from plugins config)",
          },
        ]),
      );
    }
  });

  it("surfaces plugin config diagnostics", async () => {
    const pluginDir = path.join(suiteHome, "bad-plugin");
    await writePluginFixture({
      dir: pluginDir,
      id: "bad-plugin",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          value: { type: "boolean" },
        },
        required: ["value"],
      },
    });

    const res = validateInSuite({
      agents: { list: [{ id: "pi", workspace: "/tmp/test-workspace" }] },
      plugins: {
        enabled: true,
        load: { paths: [pluginDir] },
        entries: { "bad-plugin": { config: { value: "nope" } } },
      },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      const hasIssue = res.issues.some(
        (issue) =>
          issue.path.startsWith("plugins.entries.bad-plugin.config") &&
          issue.message.includes("invalid config"),
      );
      expect(hasIssue).toBe(true);
    }
  });

  it("surfaces allowed enum values for plugin config diagnostics", async () => {
    const res = validateInSuite({
      agents: { list: [{ id: "pi" }] },
      plugins: {
        enabled: true,
        load: { paths: [enumPluginDir] },
        entries: { "enum-plugin": { config: { fileFormat: "txt" } } },
      },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      const issue = res.issues.find(
        (entry) => entry.path === "plugins.entries.enum-plugin.config.fileFormat",
      );
      expect(issue).toBeDefined();
      expect(issue?.message).toContain('allowed: "markdown", "html"');
      expect(issue?.allowedValues).toEqual(["markdown", "html"]);
      expect(issue?.allowedValuesHiddenCount).toBe(0);
    }
  });

  it("accepts voice-call webhookSecurity and streaming guard config fields", async () => {
    const res = validateInSuite({
      agents: { list: [{ id: "pi" }] },
      plugins: {
        enabled: true,
        load: { paths: [voiceCallSchemaPluginDir] },
        entries: {
          "voice-call-schema-fixture": {
            config: {
              provider: "twilio",
              webhookSecurity: {
                allowedHosts: ["voice.example.com"],
                trustForwardingHeaders: false,
                trustedProxyIPs: ["127.0.0.1"],
              },
              streaming: {
                enabled: true,
                preStartTimeoutMs: 5000,
                maxPendingConnections: 16,
                maxPendingConnectionsPerIp: 4,
                maxConnections: 64,
              },
              staleCallReaperSeconds: 180,
            },
          },
        },
      },
    });
    expect(res.ok).toBe(true);
  });

  it("accepts known plugin ids and valid channel/heartbeat enums", async () => {
    const res = validateInSuite({
      agents: {
        defaults: { heartbeat: { target: "last", directPolicy: "block" } },
        list: [
          { id: "pi", workspace: "/tmp/test-workspace", heartbeat: { directPolicy: "allow" } },
        ],
      },
      channels: {
        modelByChannel: {
          openai: {
            whatsapp: "openai/gpt-5.2",
          },
        },
      },
      plugins: { enabled: false, entries: { discord: { enabled: true } } },
    });
    expect(res.ok).toBe(true);
  });

  it("accepts plugin heartbeat targets", async () => {
    const pluginDir = path.join(suiteHome, "bluebubbles-plugin");
    await writePluginFixture({
      dir: pluginDir,
      id: "bluebubbles-plugin",
      channels: ["bluebubbles"],
      schema: { type: "object" },
    });

    const res = validateInSuite({
      agents: {
        defaults: { heartbeat: { target: "bluebubbles" } },
        list: [{ id: "pi", workspace: "/tmp/test-workspace" }],
      },
      plugins: { enabled: false, load: { paths: [pluginDir] } },
    });
    expect(res.ok).toBe(true);
  });

  it("rejects unknown heartbeat targets", async () => {
    const res = validateInSuite({
      agents: {
        defaults: { heartbeat: { target: "not-a-channel" } },
        list: [{ id: "pi", workspace: "/tmp/test-workspace" }],
      },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.issues).toContainEqual({
        path: "agents.defaults.heartbeat.target",
        message: "unknown heartbeat target: not-a-channel",
      });
    }
  });

  it("rejects invalid heartbeat directPolicy values", async () => {
    const res = validateInSuite({
      agents: {
        defaults: { heartbeat: { directPolicy: "maybe" } },
        list: [{ id: "pi", workspace: "/tmp/test-workspace" }],
      },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(
        res.issues.some((issue) => issue.path === "agents.defaults.heartbeat.directPolicy"),
      ).toBe(true);
    }
  });
});
