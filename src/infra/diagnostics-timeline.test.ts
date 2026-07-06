import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { RemoteClawConfig } from "../config/types.remoteclaw.js";
import {
  emitDiagnosticsTimelineEvent,
  flushDiagnosticsTimelineForTest,
  isDiagnosticsTimelineEnabled,
  measureDiagnosticsTimelineSpan,
  measureDiagnosticsTimelineSpanSync,
} from "./diagnostics-timeline.js";

const tempDirs: string[] = [];

async function createTimelineEnv() {
  const dir = await mkdtemp(join(tmpdir(), "remoteclaw-diagnostics-timeline-"));
  tempDirs.push(dir);
  return {
    env: {
      REMOTECLAW_DIAGNOSTICS: "timeline",
      REMOTECLAW_DIAGNOSTICS_RUN_ID: "run-1",
      REMOTECLAW_DIAGNOSTICS_ENV: "env-1",
      REMOTECLAW_DIAGNOSTICS_TIMELINE_PATH: join(dir, "nested", "timeline.jsonl"),
    } as NodeJS.ProcessEnv,
    path: join(dir, "nested", "timeline.jsonl"),
  };
}

async function readTimeline(path: string) {
  await flushDiagnosticsTimelineForTest();
  return (await readFile(path, "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("diagnostics timeline", () => {
  it("detects when timeline output is enabled", async () => {
    const { env } = await createTimelineEnv();

    expect(isDiagnosticsTimelineEnabled({ env })).toBe(true);
    expect(isDiagnosticsTimelineEnabled({ env: { ...env, REMOTECLAW_DIAGNOSTICS: "1" } })).toBe(
      true,
    );
    expect(isDiagnosticsTimelineEnabled({ env: { ...env, REMOTECLAW_DIAGNOSTICS: "yes" } })).toBe(
      true,
    );
    expect(isDiagnosticsTimelineEnabled({ env: { ...env, REMOTECLAW_DIAGNOSTICS: "on" } })).toBe(
      true,
    );
    expect(isDiagnosticsTimelineEnabled({ env: { ...env, REMOTECLAW_DIAGNOSTICS: "all" } })).toBe(
      true,
    );
    expect(isDiagnosticsTimelineEnabled({ env: { ...env, REMOTECLAW_DIAGNOSTICS: "*" } })).toBe(
      true,
    );
    expect(
      isDiagnosticsTimelineEnabled({
        env: { ...env, REMOTECLAW_DIAGNOSTICS: "diagnostics.timeline" },
      }),
    ).toBe(true);
    expect(
      isDiagnosticsTimelineEnabled({ env: { ...env, REMOTECLAW_DIAGNOSTICS: "telegram.http" } }),
    ).toBe(false);
    expect(isDiagnosticsTimelineEnabled({ env: { ...env, REMOTECLAW_DIAGNOSTICS: "0" } })).toBe(
      false,
    );
    expect(
      isDiagnosticsTimelineEnabled({
        env: { ...env, REMOTECLAW_DIAGNOSTICS_TIMELINE_PATH: "" },
      }),
    ).toBe(false);
  });

  it("honors config diagnostics flags after config is available", async () => {
    const { env } = await createTimelineEnv();
    const envWithoutFlag = { ...env };
    delete envWithoutFlag.REMOTECLAW_DIAGNOSTICS;
    const configWithTimeline = { diagnostics: { flags: ["timeline"] } } as RemoteClawConfig;
    const configWithWildcard = { diagnostics: { flags: ["*"] } } as RemoteClawConfig;
    const configWithoutTimeline = { diagnostics: { flags: ["telegram.http"] } } as RemoteClawConfig;

    expect(isDiagnosticsTimelineEnabled({ config: configWithTimeline, env: envWithoutFlag })).toBe(
      true,
    );
    expect(isDiagnosticsTimelineEnabled({ config: configWithWildcard, env: envWithoutFlag })).toBe(
      true,
    );
    expect(
      isDiagnosticsTimelineEnabled({ config: configWithoutTimeline, env: envWithoutFlag }),
    ).toBe(false);
  });

  it("lets false-like env diagnostics disable config-enabled timeline output", async () => {
    const { env } = await createTimelineEnv();
    const configWithTimeline = { diagnostics: { flags: ["timeline"] } } as RemoteClawConfig;

    expect(
      isDiagnosticsTimelineEnabled({
        config: configWithTimeline,
        env: { ...env, REMOTECLAW_DIAGNOSTICS: "0" },
      }),
    ).toBe(false);
  });

  it("writes JSONL diagnostic events with the stable envelope", async () => {
    const { env, path } = await createTimelineEnv();

    emitDiagnosticsTimelineEvent(
      {
        type: "mark",
        name: "gateway.ready",
        phase: "startup",
        attributes: {
          ok: true,
          count: 2,
          ignored: Number.NaN,
        },
      },
      { env },
    );

    const [event] = await readTimeline(path);
    expect(event).toMatchObject({
      schemaVersion: "remoteclaw.diagnostics.v1",
      type: "mark",
      name: "gateway.ready",
      runId: "run-1",
      envName: "env-1",
      phase: "startup",
      attributes: {
        ok: true,
        count: 2,
      },
    });
    expect(event?.timestamp).toEqual(expect.any(String));
    expect(event?.pid).toEqual(expect.any(Number));
    expect((event?.attributes as Record<string, unknown> | undefined)?.ignored).toBeUndefined();
  });

  it("records span start and end events around successful work", async () => {
    const { env, path } = await createTimelineEnv();
    const configOnlyEnv = { ...env };
    delete configOnlyEnv.REMOTECLAW_DIAGNOSTICS;

    await expect(
      measureDiagnosticsTimelineSpan("runtimeDeps.stage", () => "ok", {
        phase: "startup",
        attributes: { pluginCount: 3 },
        config: { diagnostics: { flags: ["timeline"] } } as RemoteClawConfig,
        env: configOnlyEnv,
      }),
    ).resolves.toBe("ok");

    const events = await readTimeline(path);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      type: "span.start",
      name: "runtimeDeps.stage",
      phase: "startup",
      attributes: { pluginCount: 3 },
    });
    expect(events[1]).toMatchObject({
      type: "span.end",
      name: "runtimeDeps.stage",
      phase: "startup",
      attributes: { pluginCount: 3 },
    });
    expect(events[1]?.spanId).toBe(events[0]?.spanId);
    expect(events[1]?.durationMs).toEqual(expect.any(Number));
  });

  it("records span error events and rethrows failures", async () => {
    const { env, path } = await createTimelineEnv();

    await expect(
      measureDiagnosticsTimelineSpan(
        "plugins.load",
        () => {
          throw new TypeError("bad plugin");
        },
        { env, phase: "startup" },
      ),
    ).rejects.toThrow("bad plugin");

    const events = await readTimeline(path);
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({
      type: "span.error",
      name: "plugins.load",
      phase: "startup",
      errorName: "TypeError",
      errorMessage: "bad plugin",
    });
  });

  it("records synchronous spans", async () => {
    const { env, path } = await createTimelineEnv();

    const result = measureDiagnosticsTimelineSpanSync("plugins.metadata.scan", () => 42, {
      env,
      phase: "startup",
    });

    expect(result).toBe(42);
    const events = await readTimeline(path);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      type: "span.start",
      name: "plugins.metadata.scan",
    });
    expect(events[1]).toMatchObject({
      type: "span.end",
      name: "plugins.metadata.scan",
    });
  });
});
