import { describe, expect, it } from "vitest";
import {
  compareToBaseline,
  normalizeMessage,
  parseBaseline,
  parseDiagnostics,
  renderBaseline,
  summarize,
} from "../../scripts/check-scripts-typecheck.mjs";

describe("parseDiagnostics", () => {
  it("parses tsgo diagnostics and drops their source positions", () => {
    const output = [
      "scripts/gh-read.ts(194,32): error TS2554: Expected 2 arguments, but got 1.",
    ].join("\n");

    expect(parseDiagnostics(output)).toEqual([
      { file: "scripts/gh-read.ts", code: "TS2554", message: "Expected 2 arguments, but got 1." },
    ]);
  });

  it("keeps only scripts/ diagnostics", () => {
    // src/, extensions/ and packages/ are pulled in transitively but already
    // have their own typecheck via the root tsconfig; recording them here would
    // fail this ledger for reasons that are not its to enforce.
    const output = [
      "scripts/qa-e2e.ts(10,1): error TS2307: Cannot find module 'x'.",
      "extensions/whatsapp/src/qr-image.ts(3,1): error TS7016: Could not find a declaration file.",
    ].join("\n");

    expect(parseDiagnostics(output).map((entry) => entry.file)).toEqual(["scripts/qa-e2e.ts"]);
  });

  it("drops indented continuation lines", () => {
    const output = [
      "scripts/a.ts(1,1): error TS2769: No overload matches this call.",
      "  The last overload gave the following error.",
      "    Type 'Buffer' is not assignable to type 'BodyInit'.",
    ].join("\n");

    expect(parseDiagnostics(output)).toHaveLength(1);
  });
});

describe("normalizeMessage", () => {
  it("strips the absolute checkout path so the ledger is not machine-specific", () => {
    const message = "'/repo/node_modules/qrcode-terminal/index.js' implicitly has an 'any' type.";

    expect(normalizeMessage(message, "/repo")).toBe(
      "'node_modules/qrcode-terminal/index.js' implicitly has an 'any' type.",
    );
  });

  it("collapses pnpm's content-addressed segment so a lockfile bump does not churn", () => {
    const message = "'/repo/node_modules/.pnpm/qrcode-terminal@0.12.0/node_modules/q/i.js' is any.";

    expect(normalizeMessage(message, "/repo")).toBe(
      "'node_modules/.pnpm/<pkg>/node_modules/q/i.js' is any.",
    );
  });
});

describe("baseline round-trip", () => {
  it("renders and re-parses a signature map unchanged", () => {
    const counts = summarize(
      parseDiagnostics(
        [
          "scripts/a.ts(1,1): error TS2307: Cannot find module 'x'.",
          "scripts/a.ts(9,9): error TS2307: Cannot find module 'x'.",
          "scripts/b.ts(2,2): error TS2554: Expected 2 arguments, but got 1.",
        ].join("\n"),
      ),
    );

    expect(parseBaseline(renderBaseline(counts))).toEqual(counts);
    expect(counts.get("scripts/a.ts\tTS2307\tCannot find module 'x'.")).toBe(2);
  });

  it("rejects a malformed baseline line rather than reading it as zero", () => {
    expect(() => parseBaseline("not-a-count\tscripts/a.ts\tTS1\tmsg")).toThrow(/Malformed/u);
  });
});

describe("compareToBaseline", () => {
  const baseline = new Map([["scripts/a.ts\tTS2307\tCannot find module 'x'.", 2]]);

  it("passes when observed errors match the baseline exactly", () => {
    const observed = new Map([["scripts/a.ts\tTS2307\tCannot find module 'x'.", 2]]);
    const result = compareToBaseline(observed, baseline);

    expect(result.regressions).toEqual([]);
    expect(result.resolved).toEqual([]);
  });

  it("flags a signature the baseline does not grandfather", () => {
    const observed = new Map([["scripts/b.ts\tTS2554\tExpected 2 arguments, but got 1.", 1]]);

    expect(compareToBaseline(observed, baseline).regressions).toEqual([
      { signature: "scripts/b.ts\tTS2554\tExpected 2 arguments, but got 1.", count: 1, allowed: 0 },
    ]);
  });

  it("flags an extra occurrence of an already-grandfathered signature", () => {
    const observed = new Map([["scripts/a.ts\tTS2307\tCannot find module 'x'.", 3]]);

    expect(compareToBaseline(observed, baseline).regressions).toHaveLength(1);
  });

  it("flags a fixed error whose baseline line was left behind", () => {
    expect(compareToBaseline(new Map(), baseline).resolved).toEqual([
      { signature: "scripts/a.ts\tTS2307\tCannot find module 'x'.", count: 0, allowed: 2 },
    ]);
  });
});
