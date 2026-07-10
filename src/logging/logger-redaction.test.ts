import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getChildLogger, resetLogger, setLoggerOverride } from "./logger.js";
import { createSubsystemLogger } from "./subsystem.js";

// Regression coverage for issue #2848 (redaction-coverage audit): the file log
// sink is served to remote operator clients via the gateway `logs.tail` method
// and the CLI `logs` command, and neither redacts on read. Redaction therefore
// has to happen at write time in the tslog file transport (`buildLogger`), which
// is the single choke point every file feeder funnels through. Before the fix
// these paths wrote raw secrets to the log file.

function tmpLogPath(name: string): string {
  return path.join(
    os.tmpdir(),
    `remoteclaw-redact-${name}-${process.pid}-${process.hrtime.bigint()}.log`,
  );
}

function readLog(file: string): string {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf-8") : "";
}

describe("file log write-path redaction", () => {
  afterEach(() => {
    setLoggerOverride(null);
    resetLogger();
  });

  it("redacts secrets written through the subsystem logger", () => {
    const file = tmpLogPath("subsystem");
    fs.rmSync(file, { force: true });
    setLoggerOverride({ level: "info", file, consoleLevel: "silent" });

    createSubsystemLogger("gateway/client").error(
      "connect failed token=supersecretvalue1234567890 sk-abcdefghijklmnop123456",
    );

    const content = readLog(file);
    expect(content.length).toBeGreaterThan(0);
    expect(content).not.toContain("supersecretvalue1234567890");
    expect(content).not.toContain("sk-abcdefghijklmnop123456");
    // The surrounding diagnostic text is preserved so logs stay useful.
    expect(content).toContain("connect failed");
    fs.rmSync(file, { force: true });
  });

  it("redacts secrets written through a direct getChildLogger caller", () => {
    // Direct getLogger()/getChildLogger() callers (cron, plugins, bonjour, …)
    // bypass the subsystem console-redaction and the console.* capture layer, so
    // only the transport-level redaction protects them.
    const file = tmpLogPath("child");
    fs.rmSync(file, { force: true });
    setLoggerOverride({ level: "info", file, consoleLevel: "silent" });

    getChildLogger({ subsystem: "cron-delivery" }).info(
      "delivering webhook ?access_token=leakedtokenvalue0987654321 done",
    );

    const content = readLog(file);
    expect(content.length).toBeGreaterThan(0);
    expect(content).not.toContain("leakedtokenvalue0987654321");
    expect(content).toContain("delivering webhook");
    fs.rmSync(file, { force: true });
  });

  it("redacts a credential that begins the log message", () => {
    // A credential at the very start of a value would sit right after the JSON
    // string-open quote once serialized, which the redactor treats as a non-word
    // boundary — so the transport redacts each raw positional string first, in
    // raw text, matching what the console sink does with the raw message.
    const file = tmpLogPath("valuestart");
    fs.rmSync(file, { force: true });
    setLoggerOverride({ level: "info", file, consoleLevel: "silent" });

    createSubsystemLogger("gateway/client").error("token=hunter2secretpassword1234567 rejected");

    const content = readLog(file);
    expect(content.length).toBeGreaterThan(0);
    expect(content).not.toContain("hunter2secretpassword1234567");
    expect(content).toContain("rejected");
    for (const rawLine of content.split("\n").filter(Boolean)) {
      expect(() => JSON.parse(rawLine)).not.toThrow();
    }
    fs.rmSync(file, { force: true });
  });

  it("redacts a credential inside a nested object argument", () => {
    // Object args reach the transport as nested objects; redaction recurses into
    // their string leaves rather than relying on a post-serialization pass that
    // the JSON quote would defeat.
    const file = tmpLogPath("nested");
    fs.rmSync(file, { force: true });
    setLoggerOverride({ level: "info", file, consoleLevel: "silent" });

    createSubsystemLogger("gateway").error("auth failed", {
      detail: "token=hunter2secretpassword1234567",
    });

    const content = readLog(file);
    expect(content.length).toBeGreaterThan(0);
    expect(content).not.toContain("hunter2secretpassword1234567");
    for (const rawLine of content.split("\n").filter(Boolean)) {
      expect(() => JSON.parse(rawLine)).not.toThrow();
    }
    fs.rmSync(file, { force: true });
  });

  it("keeps the record valid JSON when a secret ends a nested value", () => {
    // Regression guard: redacting the *serialized* record would let a raw-text
    // value class run past the value's closing quote and swallow adjacent JSON
    // structure, corrupting the line. Redacting the raw leaf avoids that.
    const file = tmpLogPath("nested-end");
    fs.rmSync(file, { force: true });
    setLoggerOverride({ level: "info", file, consoleLevel: "silent" });

    createSubsystemLogger("gateway").error("connect failed", {
      detail: "retry token=SECRETVALUE1234567890",
    });

    const content = readLog(file);
    expect(content.length).toBeGreaterThan(0);
    expect(content).not.toContain("SECRETVALUE1234567890");
    for (const rawLine of content.split("\n").filter(Boolean)) {
      const parsed = JSON.parse(rawLine) as Record<string, unknown>;
      // The adjacent message field must survive intact (no structure bleed).
      expect(JSON.stringify(parsed)).toContain("connect failed");
    }
    fs.rmSync(file, { force: true });
  });

  it("redacts a credential inside a logged Error's message", () => {
    // `logger.error("…", err)` is the most common shape that carries a secret
    // (e.g. "auth failed" + an error whose message embeds the rejected token).
    // tslog expands the Error into a plain { message, stack, … } object, so the
    // recursive leaf redaction reaches the message string.
    const file = tmpLogPath("error");
    fs.rmSync(file, { force: true });
    setLoggerOverride({ level: "info", file, consoleLevel: "silent" });

    getChildLogger({ subsystem: "gateway" }).error(
      "request rejected",
      new Error("upstream said token=ERRSECRETvalue1234567890 is invalid"),
    );

    const content = readLog(file);
    expect(content.length).toBeGreaterThan(0);
    expect(content).not.toContain("ERRSECRETvalue1234567890");
    // The line is still written (not dropped) and stays parseable.
    expect(content).toContain("request rejected");
    for (const rawLine of content.split("\n").filter(Boolean)) {
      expect(() => JSON.parse(rawLine)).not.toThrow();
    }
    fs.rmSync(file, { force: true });
  });

  it("redacts a secret bound into a child logger's context (_meta.name)", () => {
    // getChildLogger(bindings) stores the bindings as the child logger's name,
    // which tslog surfaces as `_meta.name`. A plugin binding request-scoped
    // context could embed a credential there, so the transport redacts `_meta`'s
    // caller-derived fields (name / parentNames) too — not just positional args.
    const file = tmpLogPath("meta");
    fs.rmSync(file, { force: true });
    setLoggerOverride({ level: "info", file, consoleLevel: "silent" });

    getChildLogger({
      subsystem: "webhook",
      url: "https://hook.example/cb?access_token=METASECRETvalue1234567890",
    }).info("dispatching");

    const content = readLog(file);
    expect(content.length).toBeGreaterThan(0);
    expect(content).not.toContain("METASECRETvalue1234567890");
    for (const rawLine of content.split("\n").filter(Boolean)) {
      expect(() => JSON.parse(rawLine)).not.toThrow();
    }
    fs.rmSync(file, { force: true });
  });

  it("preserves non-secret content and keeps the record valid JSON", () => {
    const file = tmpLogPath("json");
    fs.rmSync(file, { force: true });
    setLoggerOverride({ level: "info", file, consoleLevel: "silent" });

    createSubsystemLogger("startup").info("service ready on port 8080");

    const content = readLog(file).trim();
    expect(content).toContain("service ready on port 8080");
    for (const rawLine of content.split("\n").filter(Boolean)) {
      expect(() => JSON.parse(rawLine)).not.toThrow();
    }
    fs.rmSync(file, { force: true });
  });
});
