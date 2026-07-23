// Diagnostics Otel tests cover service plugin behavior.
import { afterAll, afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const telemetryState = vi.hoisted(() => {
  const counters = new Map<string, { add: ReturnType<typeof vi.fn> }>();
  const histograms = new Map<string, { record: ReturnType<typeof vi.fn> }>();
  const spans: Array<{
    name: string;
    end: ReturnType<typeof vi.fn>;
    setStatus: ReturnType<typeof vi.fn>;
  }> = [];
  const tracer = {
    startSpan: vi.fn((name: string, _opts?: unknown, _ctx?: unknown) => {
      const span = {
        end: vi.fn(),
        setStatus: vi.fn(),
      };
      spans.push({ name, ...span });
      return span;
    }),
    setSpanContext: vi.fn((_ctx: unknown, spanContext: unknown) => ({ spanContext })),
  };
  const meter = {
    createCounter: vi.fn((name: string) => {
      const counter = { add: vi.fn() };
      counters.set(name, counter);
      return counter;
    }),
    createHistogram: vi.fn((name: string) => {
      const histogram = { record: vi.fn() };
      histograms.set(name, histogram);
      return histogram;
    }),
  };
  return { counters, histograms, spans, tracer, meter };
});

const sdkStart = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const sdkShutdown = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const logEmit = vi.hoisted(() => vi.fn());
const logShutdown = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const traceExporterCtor = vi.hoisted(() => vi.fn());

vi.mock("@opentelemetry/api", () => ({
  context: {
    active: () => ({}),
  },
  metrics: {
    getMeter: () => telemetryState.meter,
  },
  trace: {
    getTracer: () => telemetryState.tracer,
    setSpanContext: telemetryState.tracer.setSpanContext,
  },
  TraceFlags: {
    NONE: 0,
    SAMPLED: 1,
  },
  SpanStatusCode: {
    ERROR: 2,
  },
}));

vi.mock("@opentelemetry/sdk-node", () => ({
  NodeSDK: class {
    start = sdkStart;
    shutdown = sdkShutdown;
  },
}));

vi.mock("@opentelemetry/exporter-metrics-otlp-proto", () => ({
  OTLPMetricExporter: function OTLPMetricExporter() {},
}));

vi.mock("@opentelemetry/exporter-trace-otlp-proto", () => ({
  OTLPTraceExporter: function OTLPTraceExporter(options?: unknown) {
    traceExporterCtor(options);
  },
}));

vi.mock("@opentelemetry/exporter-logs-otlp-proto", () => ({
  OTLPLogExporter: function OTLPLogExporter() {},
}));

vi.mock("@opentelemetry/sdk-logs", () => ({
  BatchLogRecordProcessor: function BatchLogRecordProcessor() {},
  LoggerProvider: class {
    getLogger = vi.fn(() => ({
      emit: logEmit,
    }));
    shutdown = logShutdown;
  },
}));

vi.mock("@opentelemetry/sdk-metrics", () => ({
  PeriodicExportingMetricReader: function PeriodicExportingMetricReader() {},
}));

vi.mock("@opentelemetry/sdk-trace-base", () => ({
  ParentBasedSampler: function ParentBasedSampler() {},
  TraceIdRatioBasedSampler: function TraceIdRatioBasedSampler() {},
}));

vi.mock("@opentelemetry/resources", () => ({
  resourceFromAttributes: vi.fn((attrs: Record<string, unknown>) => attrs),
  Resource: function Resource(_value?: unknown) {
    // Constructor shape required by the mocked OpenTelemetry API.
  },
}));

vi.mock("@opentelemetry/semantic-conventions", () => ({
  ATTR_SERVICE_NAME: "service.name",
}));

import type { RemoteClawPluginServiceContext } from "../api.js";
import { emitDiagnosticEvent } from "../api.js";
import { createDiagnosticsOtelService } from "./service.js";

const OTEL_TEST_STATE_DIR = "/tmp/remoteclaw-diagnostics-otel-test";
const OTEL_TEST_ENDPOINT = "http://otel-collector:4318";
const OTEL_TEST_PROTOCOL = "http/protobuf";
const TRACE_ID = "4bf92f3577b34da6a3ce929d0e0e4736";
const SPAN_ID = "00f067aa0ba902b7";
const CHILD_SPAN_ID = "1111111111111111";
const GRANDCHILD_SPAN_ID = "2222222222222222";
const PROTO_KEY = "__proto__";
const MAX_TEST_OTEL_CONTENT_ATTRIBUTE_CHARS = 4096;
const OTEL_TRUNCATED_SUFFIX_MAX_CHARS = 20;
const ORIGINAL_REMOTECLAW_OTEL_PRELOADED = process.env.REMOTECLAW_OTEL_PRELOADED;

function createLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
}

type OtelContextFlags = {
  traces?: boolean;
  metrics?: boolean;
  logs?: boolean;
  captureContent?: NonNullable<
    NonNullable<RemoteClawPluginServiceContext["config"]["diagnostics"]>["otel"]
  >["captureContent"];
};
function createOtelContext(
  endpoint: string,
  { traces = false, metrics = false, logs = false, captureContent }: OtelContextFlags = {},
): RemoteClawPluginServiceContext {
  return {
    config: {
      diagnostics: {
        enabled: true,
        otel: {
          enabled: true,
          endpoint,
          protocol: OTEL_TEST_PROTOCOL,
          traces,
          metrics,
          logs,
          ...(captureContent !== undefined ? { captureContent } : {}),
        },
      },
    },
    logger: createLogger(),
    stateDir: OTEL_TEST_STATE_DIR,
  };
}

function createTraceOnlyContext(endpoint: string): RemoteClawPluginServiceContext {
  return createOtelContext(endpoint, { traces: true });
}

function startedSpanCall(name: string) {
  const calls = telemetryState.tracer.startSpan.mock.calls as unknown as Array<
    [string, { attributes?: Record<string, unknown>; startTime?: unknown }?, unknown?]
  >;
  return calls.find(([spanName]) => spanName === name);
}

function startedSpanOptions(name: string) {
  return startedSpanCall(name)?.[1];
}

function lastHistogramRecord(name: string) {
  return telemetryState.histograms.get(name)?.record.mock.calls.at(-1) as
    | [unknown, Record<string, unknown>?]
    | undefined;
}

function histogramCreateOptions(name: string) {
  const calls = telemetryState.meter.createHistogram.mock.calls as unknown as Array<
    [string, unknown?]
  >;
  const call = calls.find(([histogramName]) => histogramName === name);
  return call?.[1] as
    | { unit?: unknown; advice?: { explicitBucketBoundaries?: unknown[] } }
    | undefined;
}

async function emitAndCaptureLog(
  event: Omit<Extract<Parameters<typeof emitDiagnosticEvent>[0], { type: "log.record" }>, "type">,
) {
  const service = createDiagnosticsOtelService();
  const ctx = createOtelContext(OTEL_TEST_ENDPOINT, { logs: true });
  await service.start(ctx);
  emitDiagnosticEvent({
    type: "log.record",
    ...event,
  });
  await flushDiagnosticEvents();
  expect(logEmit).toHaveBeenCalled();
  const emitCall = logEmit.mock.calls[0]?.[0];
  await service.stop?.(ctx);
  return emitCall;
}

function flushDiagnosticEvents() {
  return new Promise<void>((resolve) => setImmediate(resolve));
}

afterAll(() => {
  vi.doUnmock("@opentelemetry/api");
  vi.doUnmock("@opentelemetry/sdk-node");
  vi.doUnmock("@opentelemetry/exporter-metrics-otlp-proto");
  vi.doUnmock("@opentelemetry/exporter-trace-otlp-proto");
  vi.doUnmock("@opentelemetry/exporter-logs-otlp-proto");
  vi.doUnmock("@opentelemetry/sdk-logs");
  vi.doUnmock("@opentelemetry/sdk-metrics");
  vi.doUnmock("@opentelemetry/sdk-trace-base");
  vi.doUnmock("@opentelemetry/resources");
  vi.doUnmock("@opentelemetry/semantic-conventions");
  vi.resetModules();
});

describe("diagnostics-otel service", () => {
  beforeEach(() => {
    delete process.env.REMOTECLAW_OTEL_PRELOADED;
    telemetryState.counters.clear();
    telemetryState.histograms.clear();
    telemetryState.spans.length = 0;
    telemetryState.tracer.startSpan.mockClear();
    telemetryState.tracer.setSpanContext.mockClear();
    telemetryState.meter.createCounter.mockClear();
    telemetryState.meter.createHistogram.mockClear();
    sdkStart.mockClear();
    sdkShutdown.mockClear();
    logEmit.mockReset();
    logShutdown.mockClear();
    traceExporterCtor.mockClear();
  });

  afterEach(() => {
    if (ORIGINAL_REMOTECLAW_OTEL_PRELOADED === undefined) {
      delete process.env.REMOTECLAW_OTEL_PRELOADED;
    } else {
      process.env.REMOTECLAW_OTEL_PRELOADED = ORIGINAL_REMOTECLAW_OTEL_PRELOADED;
    }
  });

  test("records message-flow metrics and spans", async () => {
    const service = createDiagnosticsOtelService();
    const ctx = createOtelContext(OTEL_TEST_ENDPOINT, { traces: true, metrics: true, logs: true });
    await service.start(ctx);

    emitDiagnosticEvent({
      type: "webhook.received",
      channel: "telegram",
      updateType: "telegram-post",
    });
    emitDiagnosticEvent({
      type: "webhook.processed",
      channel: "telegram",
      updateType: "telegram-post",
      durationMs: 120,
    });
    emitDiagnosticEvent({
      type: "message.queued",
      channel: "telegram",
      source: "telegram",
      queueDepth: 2,
    });
    emitDiagnosticEvent({
      type: "message.processed",
      channel: "telegram",
      outcome: "completed",
      durationMs: 55,
    });
    emitDiagnosticEvent({
      type: "queue.lane.dequeue",
      lane: "main",
      queueSize: 3,
      waitMs: 10,
    });
    emitDiagnosticEvent({
      type: "session.stuck",
      state: "processing",
      ageMs: 125_000,
    });
    emitDiagnosticEvent({
      type: "run.attempt",
      runId: "run-1",
      attempt: 2,
    });

    expect(telemetryState.counters.get("remoteclaw.webhook.received")?.add).toHaveBeenCalledWith(
      1,
      {
        "remoteclaw.channel": "telegram",
        "remoteclaw.webhook": "telegram-post",
      },
    );
    expect(
      telemetryState.histograms.get("remoteclaw.webhook.duration_ms")?.record,
    ).toHaveBeenCalledWith(120, {
      "remoteclaw.channel": "telegram",
      "remoteclaw.webhook": "telegram-post",
    });
    expect(telemetryState.counters.get("remoteclaw.message.queued")?.add).toHaveBeenCalledWith(1, {
      "remoteclaw.channel": "telegram",
      "remoteclaw.source": "telegram",
    });
    expect(telemetryState.histograms.get("remoteclaw.queue.depth")?.record).toHaveBeenCalledTimes(
      2,
    );
    expect(telemetryState.histograms.get("remoteclaw.queue.depth")?.record).toHaveBeenCalledWith(
      2,
      {
        "remoteclaw.channel": "telegram",
        "remoteclaw.source": "telegram",
      },
    );
    expect(telemetryState.histograms.get("remoteclaw.queue.depth")?.record).toHaveBeenCalledWith(
      3,
      {
        "remoteclaw.lane": "main",
      },
    );
    expect(telemetryState.counters.get("remoteclaw.message.processed")?.add).toHaveBeenCalledWith(
      1,
      {
        "remoteclaw.channel": "telegram",
        "remoteclaw.outcome": "completed",
      },
    );
    expect(
      telemetryState.histograms.get("remoteclaw.message.duration_ms")?.record,
    ).toHaveBeenCalledWith(55, {
      "remoteclaw.channel": "telegram",
      "remoteclaw.outcome": "completed",
    });
    expect(telemetryState.histograms.get("remoteclaw.queue.wait_ms")?.record).toHaveBeenCalledWith(
      10,
      {
        "remoteclaw.lane": "main",
      },
    );
    expect(telemetryState.counters.get("remoteclaw.session.stuck")?.add).toHaveBeenCalledTimes(1);
    expect(telemetryState.counters.get("remoteclaw.session.stuck")?.add).toHaveBeenCalledWith(1, {
      "remoteclaw.state": "processing",
    });
    expect(
      telemetryState.histograms.get("remoteclaw.session.stuck_age_ms")?.record,
    ).toHaveBeenCalledWith(125_000, {
      "remoteclaw.state": "processing",
    });
    expect(telemetryState.counters.get("remoteclaw.run.attempt")?.add).toHaveBeenCalledWith(1, {
      "remoteclaw.attempt": 2,
    });

    const spanNames = telemetryState.tracer.startSpan.mock.calls.map((call) => call[0]);
    expect(spanNames).toContain("remoteclaw.webhook.processed");
    expect(spanNames).toContain("remoteclaw.message.processed");
    expect(spanNames).toContain("remoteclaw.session.stuck");

    emitDiagnosticEvent({
      type: "log.record",
      level: "INFO",
      message: "hello",
      attributes: { subsystem: "diagnostic" },
    });
    await flushDiagnosticEvents();
    expect(logEmit).toHaveBeenCalled();

    await service.stop?.(ctx);
  });

  test("restarts without retaining prior listeners or log transports", async () => {
    const service = createDiagnosticsOtelService();
    const ctx = createOtelContext(OTEL_TEST_ENDPOINT, { traces: true, metrics: true, logs: true });
    await service.start(ctx);
    await service.start(ctx);

    expect(logShutdown).toHaveBeenCalledTimes(1);
    expect(sdkShutdown).toHaveBeenCalledTimes(1);

    telemetryState.tracer.startSpan.mockClear();
    emitDiagnosticEvent({
      type: "message.processed",
      channel: "telegram",
      outcome: "completed",
      durationMs: 10,
    });
    expect(telemetryState.tracer.startSpan).toHaveBeenCalledTimes(1);

    await service.stop?.(ctx);
    expect(logShutdown).toHaveBeenCalledTimes(2);
    expect(sdkShutdown).toHaveBeenCalledTimes(2);

    telemetryState.tracer.startSpan.mockClear();
    emitDiagnosticEvent({
      type: "message.processed",
      channel: "telegram",
      outcome: "completed",
      durationMs: 10,
    });
    expect(telemetryState.tracer.startSpan).not.toHaveBeenCalled();
  });

  test("uses a preloaded OpenTelemetry SDK without dropping diagnostic listeners", async () => {
    process.env.REMOTECLAW_OTEL_PRELOADED = "1";
    const service = createDiagnosticsOtelService();
    const ctx = createOtelContext(OTEL_TEST_ENDPOINT, { traces: true, metrics: true, logs: true });
    await service.start(ctx);

    expect(sdkStart).not.toHaveBeenCalled();
    expect(traceExporterCtor).not.toHaveBeenCalled();
    expect(ctx.logger.info).toHaveBeenCalledWith(
      "diagnostics-otel: using preloaded OpenTelemetry SDK",
    );

    emitDiagnosticEvent({
      type: "run.completed",
      runId: "run-1",
      provider: "openai",
      model: "gpt-5.4",
      outcome: "completed",
      durationMs: 100,
    });
    emitDiagnosticEvent({
      type: "log.record",
      level: "INFO",
      message: "preloaded log",
    });
    await flushDiagnosticEvents();

    expect(
      telemetryState.histograms.get("remoteclaw.run.duration_ms")?.record,
    ).toHaveBeenCalledWith(
      100,
      expect.objectContaining({
        "remoteclaw.provider": "openai",
        "remoteclaw.model": "gpt-5.4",
      }),
    );
    expect(telemetryState.tracer.startSpan).toHaveBeenCalledWith(
      "remoteclaw.run",
      expect.objectContaining({
        attributes: expect.objectContaining({
          "remoteclaw.outcome": "completed",
        }),
      }),
      undefined,
    );
    expect(logEmit).toHaveBeenCalled();

    await service.stop?.(ctx);
    expect(sdkShutdown).not.toHaveBeenCalled();
    expect(logShutdown).toHaveBeenCalledTimes(1);
  });

  test("honors disabled traces when an OpenTelemetry SDK is preloaded", async () => {
    process.env.REMOTECLAW_OTEL_PRELOADED = "1";
    const service = createDiagnosticsOtelService();
    const ctx = createOtelContext(OTEL_TEST_ENDPOINT, { traces: false, metrics: true });
    await service.start(ctx);

    emitDiagnosticEvent({
      type: "run.completed",
      runId: "run-1",
      provider: "openai",
      model: "gpt-5.4",
      outcome: "completed",
      durationMs: 100,
    });

    expect(sdkStart).not.toHaveBeenCalled();
    expect(
      telemetryState.histograms.get("remoteclaw.run.duration_ms")?.record,
    ).toHaveBeenCalledWith(
      100,
      expect.objectContaining({
        "remoteclaw.provider": "openai",
      }),
    );
    expect(telemetryState.tracer.startSpan).not.toHaveBeenCalled();

    await service.stop?.(ctx);
    expect(sdkShutdown).not.toHaveBeenCalled();
  });

  test("tears down active handles when restarted with diagnostics disabled", async () => {
    const service = createDiagnosticsOtelService();
    const enabledCtx = createOtelContext(OTEL_TEST_ENDPOINT, {
      traces: true,
      metrics: true,
      logs: true,
    });
    await service.start(enabledCtx);
    await service.start({
      ...enabledCtx,
      config: { diagnostics: { enabled: false } },
    });

    expect(logShutdown).toHaveBeenCalledTimes(1);
    expect(sdkShutdown).toHaveBeenCalledTimes(1);

    telemetryState.tracer.startSpan.mockClear();
    emitDiagnosticEvent({
      type: "message.processed",
      channel: "telegram",
      outcome: "completed",
      durationMs: 10,
    });
    expect(telemetryState.tracer.startSpan).not.toHaveBeenCalled();
  });

  test("appends signal path when endpoint contains non-signal /v1 segment", async () => {
    const service = createDiagnosticsOtelService();
    const ctx = createTraceOnlyContext("https://www.comet.com/opik/api/v1/private/otel");
    await service.start(ctx);

    const options = traceExporterCtor.mock.calls[0]?.[0] as { url?: string } | undefined;
    expect(options?.url).toBe("https://www.comet.com/opik/api/v1/private/otel/v1/traces");
    await service.stop?.(ctx);
  });

  test("keeps already signal-qualified endpoint unchanged", async () => {
    const service = createDiagnosticsOtelService();
    const ctx = createTraceOnlyContext("https://collector.example.com/v1/traces");
    await service.start(ctx);

    const options = traceExporterCtor.mock.calls[0]?.[0] as { url?: string } | undefined;
    expect(options?.url).toBe("https://collector.example.com/v1/traces");
    await service.stop?.(ctx);
  });

  test("keeps signal-qualified endpoint unchanged when it has query params", async () => {
    const service = createDiagnosticsOtelService();
    const ctx = createTraceOnlyContext("https://collector.example.com/v1/traces?timeout=30s");
    await service.start(ctx);

    const options = traceExporterCtor.mock.calls[0]?.[0] as { url?: string } | undefined;
    expect(options?.url).toBe("https://collector.example.com/v1/traces?timeout=30s");
    await service.stop?.(ctx);
  });

  test("keeps signal-qualified endpoint unchanged when signal path casing differs", async () => {
    const service = createDiagnosticsOtelService();
    const ctx = createTraceOnlyContext("https://collector.example.com/v1/Traces");
    await service.start(ctx);

    const options = traceExporterCtor.mock.calls[0]?.[0] as { url?: string } | undefined;
    expect(options?.url).toBe("https://collector.example.com/v1/Traces");
    await service.stop?.(ctx);
  });

  test("redacts sensitive data from log messages before export", async () => {
    const emitCall = await emitAndCaptureLog({
      level: "INFO",
      message: "Using API key sk-1234567890abcdef1234567890abcdef",
    });

    expect(emitCall?.body).not.toContain("sk-1234567890abcdef1234567890abcdef");
    expect(emitCall?.body).toContain("sk-123");
    expect(emitCall?.body).toContain("…");
  });

  test("redacts sensitive data from log attributes before export", async () => {
    const emitCall = await emitAndCaptureLog({
      level: "DEBUG",
      message: "auth configured",
      attributes: {
        token: "ghp_abcdefghijklmnopqrstuvwxyz123456", // pragma: allowlist secret
      },
    });

    const tokenAttr = emitCall?.attributes?.["remoteclaw.token"];
    expect(tokenAttr).not.toBe("ghp_abcdefghijklmnopqrstuvwxyz123456"); // pragma: allowlist secret
    if (typeof tokenAttr === "string") {
      expect(tokenAttr).toContain("…");
    }
  });

  test("drops snake_case diagnostic id log attributes before export", async () => {
    const emitCall = await emitAndCaptureLog({
      level: "INFO",
      message: "diagnostic id attributes",
      attributes: {
        call_id: "call-snake",
        parent_span_id: "parent-snake",
        run_id: "run-snake",
        session_id: "session-snake",
        session_key: "session-key-snake",
        span_id: "span-snake",
        tool_call_id: "tool-snake",
        trace_id: "trace-snake",
        provider: "openai",
      },
    });

    expect(emitCall?.attributes?.["remoteclaw.provider"]).toBe("openai");
    for (const key of [
      "remoteclaw.call_id",
      "remoteclaw.parent_span_id",
      "remoteclaw.run_id",
      "remoteclaw.session_id",
      "remoteclaw.session_key",
      "remoteclaw.span_id",
      "remoteclaw.tool_call_id",
      "remoteclaw.trace_id",
    ]) {
      expect(Object.hasOwn(emitCall?.attributes ?? {}, key)).toBe(false);
    }
  });

  test("attaches diagnostic trace context to exported logs", async () => {
    const emitCall = await emitAndCaptureLog({
      level: "INFO",
      message: "traceable log",
      attributes: {
        subsystem: "diagnostic",
      },
      trace: {
        traceId: TRACE_ID,
        spanId: SPAN_ID,
        traceFlags: "01",
      },
    });

    expect(emitCall?.attributes).toMatchObject({
      "remoteclaw.traceFlags": "01",
    });
    expect(emitCall?.attributes).toEqual(
      expect.not.objectContaining({
        "remoteclaw.traceId": expect.anything(),
        "remoteclaw.spanId": expect.anything(),
      }),
    );
    expect(telemetryState.tracer.setSpanContext).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        traceId: TRACE_ID,
        spanId: SPAN_ID,
        traceFlags: 1,
        isRemote: true,
      }),
    );
    expect(emitCall?.context).toEqual({
      spanContext: expect.objectContaining({
        traceId: TRACE_ID,
        spanId: SPAN_ID,
      }),
    });
  });

  test("bounds plugin-emitted log attributes and omits source paths", async () => {
    const service = createDiagnosticsOtelService();
    const ctx = createOtelContext(OTEL_TEST_ENDPOINT, { logs: true });
    await service.start(ctx);

    const attributes = Object.create(null) as Record<string, string>;
    attributes.good = "y".repeat(6000);
    attributes["bad key"] = "drop-me";
    attributes[PROTO_KEY] = "pollute";
    attributes["constructor"] = "pollute";
    attributes["prototype"] = "pollute";
    attributes["sk-1234567890abcdef1234567890abcdef"] = "secret-key"; // pragma: allowlist secret

    emitDiagnosticEvent({
      type: "log.record",
      level: "INFO",
      message: "x".repeat(6000),
      attributes,
      code: {
        filepath: "/Users/alice/remoteclaw/src/private.ts",
        line: 42,
        functionName: "handler",
        location: "/Users/alice/remoteclaw/src/private.ts:42",
      },
    } as Parameters<typeof emitDiagnosticEvent>[0]);
    await flushDiagnosticEvents();

    const emitCall = logEmit.mock.calls[0]?.[0];
    expect(emitCall?.body.length).toBeLessThanOrEqual(4200);
    expect(String(emitCall?.attributes?.["remoteclaw.good"])).toMatch(/^y+/);
    expect(emitCall?.attributes?.["code.lineno"]).toBe(42);
    expect(emitCall?.attributes?.["code.function"]).toBe("handler");
    expect(String(emitCall?.attributes?.["remoteclaw.good"]).length).toBeLessThanOrEqual(4200);
    expect(Object.hasOwn(emitCall?.attributes ?? {}, `remoteclaw.${PROTO_KEY}`)).toBe(false);
    expect(Object.hasOwn(emitCall?.attributes ?? {}, "remoteclaw.constructor")).toBe(false);
    expect(Object.hasOwn(emitCall?.attributes ?? {}, "remoteclaw.prototype")).toBe(false);
    expect(
      Object.hasOwn(
        emitCall?.attributes ?? {},
        "remoteclaw.sk-1234567890abcdef1234567890abcdef", // pragma: allowlist secret
      ),
    ).toBe(false);
    expect(Object.hasOwn(emitCall?.attributes ?? {}, "remoteclaw.bad key")).toBe(false);
    expect(Object.hasOwn(emitCall?.attributes ?? {}, "code.filepath")).toBe(false);
    expect(Object.hasOwn(emitCall?.attributes ?? {}, "remoteclaw.code.location")).toBe(false);
    await service.stop?.(ctx);
  });

  test("rate-limits repeated log export failure reports", async () => {
    const service = createDiagnosticsOtelService();
    const ctx = createOtelContext(OTEL_TEST_ENDPOINT, { logs: true });
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000);
    logEmit.mockImplementation(() => {
      throw new Error("export failed");
    });
    try {
      await service.start(ctx);

      emitDiagnosticEvent({
        type: "log.record",
        level: "ERROR",
        message: "first failing log",
      });
      emitDiagnosticEvent({
        type: "log.record",
        level: "ERROR",
        message: "second failing log",
      });
      await flushDiagnosticEvents();

      expect(ctx.logger.error).toHaveBeenCalledTimes(1);

      nowSpy.mockReturnValue(62_000);
      emitDiagnosticEvent({
        type: "log.record",
        level: "ERROR",
        message: "third failing log",
      });
      await flushDiagnosticEvents();

      expect(ctx.logger.error).toHaveBeenCalledTimes(2);
    } finally {
      nowSpy.mockRestore();
      await service.stop?.(ctx);
    }
  });

  test("does not parent diagnostic event spans from plugin-emittable trace context", async () => {
    const service = createDiagnosticsOtelService();
    const ctx = createOtelContext(OTEL_TEST_ENDPOINT, { traces: true, metrics: true });
    await service.start(ctx);

    emitDiagnosticEvent({
      type: "model.usage",
      trace: {
        traceId: TRACE_ID,
        spanId: SPAN_ID,
        traceFlags: "01",
      },
      provider: "openai",
      model: "gpt-5.4",
      usage: { total: 4 },
      durationMs: 12,
    });

    const modelUsageCall = telemetryState.tracer.startSpan.mock.calls.find(
      (call) => call[0] === "remoteclaw.model.usage",
    );
    expect(telemetryState.tracer.setSpanContext).not.toHaveBeenCalled();
    expect(modelUsageCall?.[2]).toBeUndefined();
    await service.stop?.(ctx);
  });

  test("exports run, model call, and tool execution lifecycle spans", async () => {
    const service = createDiagnosticsOtelService();
    const ctx = createOtelContext(OTEL_TEST_ENDPOINT, { traces: true, metrics: true });
    await service.start(ctx);

    emitDiagnosticEvent({
      type: "run.completed",
      runId: "run-1",
      sessionKey: "session-key",
      provider: "openai",
      model: "gpt-5.4",
      channel: "webchat",
      outcome: "completed",
      durationMs: 100,
      trace: {
        traceId: TRACE_ID,
        spanId: SPAN_ID,
        traceFlags: "01",
      },
    });
    emitDiagnosticEvent({
      type: "model.call.completed",
      runId: "run-1",
      callId: "call-1",
      provider: "openai",
      model: "gpt-5.4",
      api: "completions",
      transport: "http",
      durationMs: 80,
      trace: {
        traceId: TRACE_ID,
        spanId: CHILD_SPAN_ID,
        parentSpanId: SPAN_ID,
        traceFlags: "01",
      },
    });
    emitDiagnosticEvent({
      type: "tool.execution.error",
      runId: "run-1",
      toolName: "read",
      toolCallId: "tool-1",
      paramsSummary: { kind: "object" },
      durationMs: 20,
      errorCategory: "TypeError",
      errorCode: "429",
      trace: {
        traceId: TRACE_ID,
        spanId: GRANDCHILD_SPAN_ID,
        parentSpanId: CHILD_SPAN_ID,
        traceFlags: "01",
      },
    });
    await flushDiagnosticEvents();

    const spanNames = telemetryState.tracer.startSpan.mock.calls.map((call) => call[0]);
    expect(spanNames).toEqual(
      expect.arrayContaining([
        "remoteclaw.run",
        "remoteclaw.model.call",
        "remoteclaw.tool.execution",
      ]),
    );

    const runCall = telemetryState.tracer.startSpan.mock.calls.find(
      (call) => call[0] === "remoteclaw.run",
    );
    expect(runCall?.[1]).toMatchObject({
      attributes: {
        "remoteclaw.outcome": "completed",
        "remoteclaw.provider": "openai",
        "remoteclaw.model": "gpt-5.4",
        "remoteclaw.channel": "webchat",
      },
      startTime: expect.any(Number),
    });
    expect(runCall?.[1]).toEqual({
      attributes: expect.not.objectContaining({
        "gen_ai.system": expect.anything(),
        "gen_ai.request.model": expect.anything(),
        "remoteclaw.runId": expect.anything(),
        "remoteclaw.sessionKey": expect.anything(),
        "remoteclaw.traceId": expect.anything(),
      }),
      startTime: expect.any(Number),
    });

    const modelCall = telemetryState.tracer.startSpan.mock.calls.find(
      (call) => call[0] === "remoteclaw.model.call",
    );
    expect(modelCall?.[1]).toMatchObject({
      attributes: {
        "gen_ai.system": "openai",
        "gen_ai.request.model": "gpt-5.4",
        "gen_ai.operation.name": "text_completion",
      },
    });
    expect(modelCall?.[1]).toEqual({
      attributes: expect.not.objectContaining({
        "remoteclaw.callId": expect.anything(),
        "remoteclaw.runId": expect.anything(),
        "remoteclaw.sessionKey": expect.anything(),
      }),
      startTime: expect.any(Number),
    });
    expect(modelCall?.[2]).toBeUndefined();

    const toolCall = telemetryState.tracer.startSpan.mock.calls.find(
      (call) => call[0] === "remoteclaw.tool.execution",
    );
    expect(toolCall?.[1]).toMatchObject({
      attributes: {
        "remoteclaw.toolName": "read",
        "remoteclaw.errorCategory": "TypeError",
        "remoteclaw.errorCode": "429",
        "remoteclaw.tool.params.kind": "object",
        "gen_ai.tool.name": "read",
      },
    });
    expect(toolCall?.[1]).toEqual({
      attributes: expect.not.objectContaining({
        "remoteclaw.toolCallId": expect.anything(),
        "remoteclaw.runId": expect.anything(),
        "remoteclaw.sessionKey": expect.anything(),
      }),
      startTime: expect.any(Number),
    });
    expect(toolCall?.[2]).toBeUndefined();

    expect(
      telemetryState.histograms.get("remoteclaw.model_call.duration_ms")?.record,
    ).toHaveBeenCalledWith(
      80,
      expect.objectContaining({
        "remoteclaw.provider": "openai",
        "remoteclaw.model": "gpt-5.4",
      }),
    );
    expect(
      telemetryState.histograms.get("remoteclaw.run.duration_ms")?.record,
    ).toHaveBeenCalledWith(
      100,
      expect.not.objectContaining({
        "remoteclaw.runId": expect.anything(),
      }),
    );
    expect(
      telemetryState.histograms.get("remoteclaw.tool.execution.duration_ms")?.record,
    ).toHaveBeenCalledWith(
      20,
      expect.not.objectContaining({
        "remoteclaw.errorCode": expect.anything(),
        "remoteclaw.runId": expect.anything(),
      }),
    );

    const toolSpan = telemetryState.spans.find((span) => span.name === "remoteclaw.tool.execution");
    expect(toolSpan?.setStatus).toHaveBeenCalledWith({
      code: 2,
      message: "TypeError",
    });
    expect(toolSpan?.end.mock.calls[0]?.[0]).toBeTypeOf("number");
    expect(telemetryState.tracer.setSpanContext).not.toHaveBeenCalled();
    await service.stop?.(ctx);
  });

  test("exports exec process spans without command text", async () => {
    const service = createDiagnosticsOtelService();
    const ctx = createOtelContext(OTEL_TEST_ENDPOINT, { traces: true, metrics: true });
    await service.start(ctx);

    emitDiagnosticEvent({
      type: "exec.process.completed",
      target: "host",
      mode: "child",
      outcome: "failed",
      durationMs: 30,
      commandLength: 42,
      exitCode: 1,
      timedOut: false,
      failureKind: "runtime-error",
    });
    await flushDiagnosticEvents();

    expect(
      telemetryState.histograms.get("remoteclaw.exec.duration_ms")?.record,
    ).toHaveBeenCalledWith(
      30,
      expect.objectContaining({
        "remoteclaw.exec.target": "host",
        "remoteclaw.exec.mode": "child",
        "remoteclaw.outcome": "failed",
        "remoteclaw.failureKind": "runtime-error",
      }),
    );

    const execCall = telemetryState.tracer.startSpan.mock.calls.find(
      (call) => call[0] === "remoteclaw.exec",
    );
    expect(execCall?.[1]).toMatchObject({
      attributes: {
        "remoteclaw.exec.target": "host",
        "remoteclaw.exec.mode": "child",
        "remoteclaw.outcome": "failed",
        "remoteclaw.exec.command_length": 42,
        "remoteclaw.exec.exit_code": 1,
        "remoteclaw.exec.timed_out": false,
        "remoteclaw.failureKind": "runtime-error",
      },
      startTime: expect.any(Number),
    });
    expect(execCall?.[1]).toEqual({
      attributes: expect.not.objectContaining({
        "remoteclaw.exec.command": expect.anything(),
        "remoteclaw.exec.workdir": expect.anything(),
        "remoteclaw.sessionKey": expect.anything(),
      }),
      startTime: expect.any(Number),
    });

    const execSpan = telemetryState.spans.find((span) => span.name === "remoteclaw.exec");
    expect(execSpan?.setStatus).toHaveBeenCalledWith({
      code: 2,
      message: "runtime-error",
    });
    expect(execSpan?.end.mock.calls[0]?.[0]).toBeTypeOf("number");
    await service.stop?.(ctx);
  });

  test("does not export model or tool content unless capture is explicitly enabled", async () => {
    const service = createDiagnosticsOtelService();
    const ctx = createOtelContext(OTEL_TEST_ENDPOINT, { traces: true, metrics: true });
    await service.start(ctx);

    emitDiagnosticEvent({
      type: "model.call.completed",
      runId: "run-1",
      callId: "call-1",
      provider: "openai",
      model: "gpt-5.4",
      durationMs: 80,
      inputMessages: ["private user prompt"],
      outputMessages: ["private model reply"],
      systemPrompt: "private system prompt",
    } as Parameters<typeof emitDiagnosticEvent>[0]);
    emitDiagnosticEvent({
      type: "tool.execution.completed",
      runId: "run-1",
      toolName: "read",
      toolCallId: "tool-1",
      durationMs: 20,
      toolInput: "private tool input",
      toolOutput: "private tool output",
    } as Parameters<typeof emitDiagnosticEvent>[0]);
    await flushDiagnosticEvents();

    const modelOptions = startedSpanOptions("remoteclaw.model.call");
    expect(Object.hasOwn(modelOptions?.attributes ?? {}, "remoteclaw.content.input_messages")).toBe(
      false,
    );
    expect(
      Object.hasOwn(modelOptions?.attributes ?? {}, "remoteclaw.content.output_messages"),
    ).toBe(false);
    expect(Object.hasOwn(modelOptions?.attributes ?? {}, "remoteclaw.content.system_prompt")).toBe(
      false,
    );
    expect(modelOptions?.startTime).toBeTypeOf("number");
    const toolOptions = startedSpanOptions("remoteclaw.tool.execution");
    expect(Object.hasOwn(toolOptions?.attributes ?? {}, "remoteclaw.content.tool_input")).toBe(
      false,
    );
    expect(Object.hasOwn(toolOptions?.attributes ?? {}, "remoteclaw.content.tool_output")).toBe(
      false,
    );
    expect(toolOptions?.startTime).toBeTypeOf("number");
    await service.stop?.(ctx);
  });

  test("exports bounded redacted content when capture fields are opted in", async () => {
    const service = createDiagnosticsOtelService();
    const ctx = createOtelContext(OTEL_TEST_ENDPOINT, {
      traces: true,
      metrics: true,
      captureContent: {
        enabled: true,
        inputMessages: true,
        outputMessages: true,
        toolInputs: true,
        toolOutputs: true,
        systemPrompt: true,
      },
    });
    await service.start(ctx);

    emitDiagnosticEvent({
      type: "model.call.completed",
      runId: "run-1",
      callId: "call-1",
      provider: "openai",
      model: "gpt-5.4",
      durationMs: 80,
      inputMessages: ["use key sk-1234567890abcdef1234567890abcdef"], // pragma: allowlist secret
      outputMessages: ["model reply"],
      systemPrompt: "system prompt",
    } as Parameters<typeof emitDiagnosticEvent>[0]);
    emitDiagnosticEvent({
      type: "tool.execution.completed",
      runId: "run-1",
      toolName: "read",
      toolCallId: "tool-1",
      durationMs: 20,
      toolInput: "tool input",
      toolOutput: `${"x".repeat(4077)} Bearer ${"a".repeat(80)}`, // pragma: allowlist secret
    } as Parameters<typeof emitDiagnosticEvent>[0]);
    await flushDiagnosticEvents();

    const modelCall = telemetryState.tracer.startSpan.mock.calls.find(
      (call) => call[0] === "remoteclaw.model.call",
    );
    const toolCall = telemetryState.tracer.startSpan.mock.calls.find(
      (call) => call[0] === "remoteclaw.tool.execution",
    );
    const modelAttrs = (modelCall?.[1] as { attributes?: Record<string, unknown> } | undefined)
      ?.attributes;
    const toolAttrs = (toolCall?.[1] as { attributes?: Record<string, unknown> } | undefined)
      ?.attributes;

    expect(modelAttrs?.["remoteclaw.content.output_messages"]).toBe("model reply");
    expect(modelAttrs?.["remoteclaw.content.system_prompt"]).toBe("system prompt");
    expect(String(modelAttrs?.["remoteclaw.content.input_messages"])).not.toContain(
      "sk-1234567890abcdef1234567890abcdef", // pragma: allowlist secret
    );
    expect(toolAttrs?.["remoteclaw.content.tool_input"]).toBe("tool input");
    expect(String(toolAttrs?.["remoteclaw.content.tool_output"]).length).toBeLessThanOrEqual(
      MAX_TEST_OTEL_CONTENT_ATTRIBUTE_CHARS + OTEL_TRUNCATED_SUFFIX_MAX_CHARS,
    );
    expect(String(toolAttrs?.["remoteclaw.content.tool_output"])).not.toContain("a".repeat(11));
    await service.stop?.(ctx);
  });

  test("ignores invalid diagnostic event trace parents", async () => {
    const service = createDiagnosticsOtelService();
    const ctx = createOtelContext(OTEL_TEST_ENDPOINT, { traces: true, metrics: true });
    await service.start(ctx);

    emitDiagnosticEvent({
      type: "model.usage",
      trace: {
        traceId: "0".repeat(32),
        spanId: "not-a-span",
        traceFlags: "zz",
      },
      provider: "openai",
      model: "gpt-5.4",
      usage: { total: 4 },
      durationMs: 12,
    });

    const modelUsageCall = telemetryState.tracer.startSpan.mock.calls.find(
      (call) => call[0] === "remoteclaw.model.usage",
    );
    expect(telemetryState.tracer.setSpanContext).not.toHaveBeenCalled();
    expect(modelUsageCall?.[2]).toBeUndefined();
    await service.stop?.(ctx);
  });

  test("redacts sensitive reason in session.state metric attributes", async () => {
    const service = createDiagnosticsOtelService();
    const ctx = createOtelContext(OTEL_TEST_ENDPOINT, { metrics: true });
    await service.start(ctx);

    emitDiagnosticEvent({
      type: "session.state",
      state: "waiting",
      reason: "token=ghp_abcdefghijklmnopqrstuvwxyz123456", // pragma: allowlist secret
    });

    const sessionCounter = telemetryState.counters.get("remoteclaw.session.state");
    const attrs = sessionCounter?.add.mock.calls[0]?.[1] as Record<string, unknown> | undefined;
    expect(sessionCounter?.add.mock.calls[0]?.[0]).toBe(1);
    expect(String(attrs?.["remoteclaw.reason"])).toContain("…");
    expect(typeof attrs?.["remoteclaw.reason"]).toBe("string");
    expect(String(attrs?.["remoteclaw.reason"])).not.toContain(
      "ghp_abcdefghijklmnopqrstuvwxyz123456", // pragma: allowlist secret
    );
    await service.stop?.(ctx);
  });
});
