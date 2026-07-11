import { describe, expect, it, vi } from "vitest";
import type { DiagnosticEventPayload, RemoteClawPluginServiceContext } from "../api.js";
import { emitDiagnosticEvent } from "../api.js";
import { createDiagnosticsPrometheusExporter, testApi } from "./service.js";

function baseEvent(): Pick<DiagnosticEventPayload, "seq" | "ts"> {
  return { seq: 1, ts: 1700000000000 };
}

describe("diagnostics-prometheus service", () => {
  it("records run metrics without raw diagnostic identifiers", () => {
    const store = testApi.createPrometheusMetricStore();

    testApi.recordDiagnosticEvent(store, {
      ...baseEvent(),
      type: "run.completed",
      runId: "run-should-not-export",
      sessionKey: "session-should-not-export",
      provider: "openai",
      model: "gpt-5.4",
      channel: "discord",
      trigger: "message",
      durationMs: 1500,
      outcome: "completed",
    });

    const rendered = testApi.renderPrometheusMetrics(store);

    expect(rendered).toContain("# TYPE remoteclaw_run_completed_total counter");
    expect(rendered).toContain(
      'remoteclaw_run_completed_total{channel="discord",model="gpt-5.4",outcome="completed",provider="openai",trigger="message"} 1',
    );
    expect(rendered).toContain(
      'remoteclaw_run_duration_seconds_sum{channel="discord",model="gpt-5.4",outcome="completed",provider="openai",trigger="message"} 1.5',
    );
    expect(rendered).not.toContain("run-should-not-export");
    expect(rendered).not.toContain("session-should-not-export");
  });

  it("records hook-blocked run metrics with safe blocker originator only", () => {
    const store = testApi.createPrometheusMetricStore();

    testApi.recordDiagnosticEvent(store, {
      ...baseEvent(),
      type: "run.completed",
      runId: "run-should-not-export",
      sessionKey: "session-should-not-export",
      provider: "openai",
      model: "gpt-5.4",
      channel: "slack",
      trigger: "message",
      durationMs: 250,
      outcome: "blocked",
      blockedBy: "policy-plugin",
    });

    const rendered = testApi.renderPrometheusMetrics(store);

    expect(rendered).toContain(
      'remoteclaw_run_completed_total{blocked_by="policy-plugin",channel="slack",model="gpt-5.4",outcome="blocked",provider="openai",trigger="message"} 1',
    );
    expect(rendered).not.toContain("run-should-not-export");
    expect(rendered).not.toContain("session-should-not-export");
  });

  it("redacts and bounds label values", () => {
    const store = testApi.createPrometheusMetricStore();

    testApi.recordDiagnosticEvent(store, {
      ...baseEvent(),
      type: "tool.execution.error",
      toolName: "shell\nbad",
      durationMs: 25,
      errorCategory: "Bearer sk-secret-token-value",
    });

    const rendered = testApi.renderPrometheusMetrics(store);

    expect(rendered).toContain(
      'remoteclaw_tool_execution_total{error_category="other",outcome="error",params_kind="unknown",tool="tool"} 1',
    );
    expect(rendered).not.toContain("Bearer");
    expect(rendered).not.toContain("sk-secret");
  });

  it("records operator-critical diagnostic signals missing from generic run metrics", () => {
    const store = testApi.createPrometheusMetricStore();

    for (const event of [
      {
        ...baseEvent(),
        type: "tool.execution.blocked",
        toolName: "browser",
        deniedReason: "tools.deny",
        reason: "matched browser",
        paramsSummary: { kind: "object" },
      },
      {
        ...baseEvent(),
        type: "session.stuck",
        sessionId: "session-should-not-export",
        sessionKey: "key-should-not-export",
        state: "processing",
        ageMs: 12_000,
        reason: "startup-sweep",
      },
      {
        ...baseEvent(),
        type: "payload.large",
        surface: "gateway.frame",
        action: "rejected",
        bytes: 2048,
        limitBytes: 1024,
        channel: "web",
        pluginId: "agent:qa:otel-trace-smoke",
        reason: "body-too-large",
      },
    ] satisfies DiagnosticEventPayload[]) {
      testApi.recordDiagnosticEvent(store, event);
    }

    const rendered = testApi.renderPrometheusMetrics(store);

    expect(rendered).toContain(
      'remoteclaw_tool_execution_blocked_total{denied_reason="tools.deny",params_kind="object",tool="browser"} 1',
    );
    expect(rendered).toContain(
      'remoteclaw_session_stuck_total{reason="startup-sweep",state="processing"} 1',
    );
    expect(rendered).toContain(
      'remoteclaw_session_stuck_age_seconds_sum{reason="startup-sweep",state="processing"} 12',
    );
    expect(rendered).toContain(
      'remoteclaw_payload_large_total{action="rejected",channel="web",plugin="none",reason="body-too-large",surface="gateway.frame"} 1',
    );
    expect(rendered).toContain(
      'remoteclaw_payload_large_bytes_sum{action="rejected",channel="web",plugin="none",reason="body-too-large",surface="gateway.frame"} 2048',
    );
    expect(rendered).not.toContain("session-should-not-export");
    expect(rendered).not.toContain("key-should-not-export");
    expect(rendered).not.toContain("agent:qa:otel-trace-smoke");
  });

  it("records webhook ingress and liveness warning metrics", () => {
    const store = testApi.createPrometheusMetricStore();

    testApi.recordDiagnosticEvent(store, {
      ...baseEvent(),
      type: "webhook.received",
      channel: "telegram",
      updateType: "message",
      chatId: "chat-should-not-export",
    });
    testApi.recordDiagnosticEvent(store, {
      ...baseEvent(),
      type: "webhook.processed",
      channel: "telegram",
      updateType: "message",
      chatId: "chat-should-not-export",
      durationMs: 250,
    });
    testApi.recordDiagnosticEvent(store, {
      ...baseEvent(),
      type: "webhook.error",
      channel: "telegram",
      updateType: "message",
      chatId: "chat-should-not-export",
      error: "Bearer sk-secret",
    });
    testApi.recordDiagnosticEvent(store, {
      ...baseEvent(),
      type: "diagnostic.liveness.warning",
      reasons: ["event_loop_delay", "cpu"],
      intervalMs: 30_000,
      eventLoopDelayP99Ms: 250,
      eventLoopDelayMaxMs: 900,
      eventLoopUtilization: 0.95,
      cpuCoreRatio: 1.4,
      active: 2,
      waiting: 1,
      queued: 4,
    });

    const rendered = testApi.renderPrometheusMetrics(store);

    expect(rendered).toContain(
      'remoteclaw_webhook_received_total{channel="telegram",webhook="message"} 1',
    );
    expect(rendered).toContain(
      'remoteclaw_webhook_error_total{channel="telegram",webhook="message"} 1',
    );
    expect(rendered).toContain(
      'remoteclaw_webhook_duration_seconds_sum{channel="telegram",webhook="message"} 0.25',
    );
    expect(rendered).toContain(
      'remoteclaw_liveness_warning_total{reason="event_loop_delay:cpu"} 1',
    );
    expect(rendered).toContain('remoteclaw_liveness_sessions{state="active"} 2');
    expect(rendered).toContain(
      'remoteclaw_liveness_event_loop_delay_p99_seconds_sum{reason="event_loop_delay:cpu"} 0.25',
    );
    expect(rendered).toContain(
      'remoteclaw_liveness_cpu_core_ratio_sum{reason="event_loop_delay:cpu"} 1.4',
    );
    expect(rendered).not.toContain("chat-should-not-export");
    expect(rendered).not.toContain("sk-secret");
  });

  it("drops session-shaped queue lane labels", () => {
    const store = testApi.createPrometheusMetricStore();

    testApi.recordDiagnosticEvent(store, {
      ...baseEvent(),
      type: "queue.lane.enqueue",
      lane: "session:Agent:qa:otel-trace-smoke",
      queueSize: 2,
    });

    const rendered = testApi.renderPrometheusMetrics(store);

    expect(rendered).toContain('remoteclaw_queue_lane_size{lane="session"} 2');
    expect(rendered).not.toContain("Agent:qa:otel-trace-smoke");
  });

  it("keeps only the bounded prefix from scoped queue lane labels", () => {
    const store = testApi.createPrometheusMetricStore();

    testApi.recordDiagnosticEvent(store, {
      ...baseEvent(),
      type: "queue.lane.enqueue",
      lane: "dreaming-narrative:session-main",
      queueSize: 2,
    });

    const rendered = testApi.renderPrometheusMetrics(store);

    expect(rendered).toContain('remoteclaw_queue_lane_size{lane="dreaming-narrative"} 2');
    expect(rendered).not.toContain("session-main");
  });

  it("bounds inbound message-processed labels without exporting raw chat identifiers", () => {
    const store = testApi.createPrometheusMetricStore();

    testApi.recordDiagnosticEvent(store, {
      ...baseEvent(),
      type: "message.processed",
      channel: "telegram/custom",
      chatId: "chat-should-not-export",
      messageId: "message-should-not-export",
      outcome: "completed",
      reason: "progress draft / message tool 123",
      durationMs: 25,
    });

    const rendered = testApi.renderPrometheusMetrics(store);

    expect(rendered).toContain(
      'remoteclaw_message_processed_total{channel="unknown",outcome="completed",reason="none"} 1',
    );
    expect(rendered).not.toContain("chat-should-not-export");
    expect(rendered).not.toContain("message-should-not-export");
    expect(rendered).not.toContain("progress draft");
  });

  it("records session recovery metrics without exporting raw ids", () => {
    const store = testApi.createPrometheusMetricStore();

    testApi.recordDiagnosticEvent(store, {
      ...baseEvent(),
      type: "session.recovery.completed",
      sessionId: "session-should-not-export",
      sessionKey: "key-should-not-export",
      state: "processing",
      stateGeneration: 2,
      ageMs: 12_000,
      queueDepth: 1,
      reason: "startup-sweep",
      activeWorkKind: "tool_call",
      allowActiveAbort: true,
      status: "released",
      action: "abort-active-run",
    });

    const rendered = testApi.renderPrometheusMetrics(store);

    expect(rendered).toContain(
      'remoteclaw_session_recovery_total{action="abort-active-run",active_work_kind="tool_call",state="processing",status="released"} 1',
    );
    expect(rendered).toContain(
      'remoteclaw_session_recovery_age_seconds_sum{action="abort-active-run",active_work_kind="tool_call",state="processing",status="released"} 12',
    );
    expect(rendered).not.toContain("session-should-not-export");
    expect(rendered).not.toContain("key-should-not-export");
  });

  it("caps metric series growth and reports dropped series", () => {
    const store = testApi.createPrometheusMetricStore();

    for (let index = 0; index < 2100; index += 1) {
      testApi.recordDiagnosticEvent(store, {
        ...baseEvent(),
        type: "model.call.completed",
        runId: `run-${index}`,
        callId: `call-${index}`,
        provider: "openai",
        model: `model.${index}`,
        durationMs: 10,
      });
    }

    const rendered = testApi.renderPrometheusMetrics(store);

    expect(rendered).toContain("# TYPE remoteclaw_prometheus_series_dropped_total counter");
    expect(rendered).toContain("remoteclaw_prometheus_series_dropped_total ");
  });

  it("subscribes to internal diagnostics and renders scrape text", () => {
    const exporter = createDiagnosticsPrometheusExporter();
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };
    const ctx = {
      config: {} as never,
      stateDir: "/tmp/remoteclaw-prometheus-test",
      logger,
    } satisfies RemoteClawPluginServiceContext;

    exporter.service.start(ctx);

    emitDiagnosticEvent({
      type: "model.usage",
      provider: "openai",
      model: "gpt-5.4",
      usage: { input: 12, output: 3, total: 15 },
    });

    expect(exporter.render()).toContain(
      'remoteclaw_model_tokens_total{channel="unknown",model="gpt-5.4",provider="openai",token_type="input"} 12',
    );

    exporter.service.stop?.();

    expect(exporter.render()).toBe("");
  });
});
