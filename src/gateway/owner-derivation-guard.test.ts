import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// #2735 CI-assert meta-guard. Runs the standalone owner-derivation gate
// (scripts/check-openai-http-owner-derivation.mjs) inside the gateway test lane
// so "green test-gateway" stays a FAITHFUL proxy for "the
// unauthenticated-none-no-header senderIsOwner:false invariant is still
// asserted". If the openai-http.test.ts anchor is removed, skipped, or stops
// asserting not-owner, the gate exits non-zero, execFileSync throws, and this
// fails loudly — the IDOR hole could otherwise silently re-open (e.g. on an
// upstream sync) with CI staying green. Running the real script (vs duplicating
// its logic here) keeps the gate single-sourced.
const guardScript = fileURLToPath(
  new URL("../../scripts/check-openai-http-owner-derivation.mjs", import.meta.url),
);

describe("#2735 owner-derivation guard", () => {
  it("openai-http anchor test is present, un-skipped, and asserts senderIsOwner:false", () => {
    let stdout = "";
    try {
      stdout = execFileSync(process.execPath, [guardScript], { stdio: "pipe", encoding: "utf8" });
    } catch (caught) {
      const err = caught as { stderr?: string; message?: string };
      const detail = err.stderr?.trim() || err.message || "guard subprocess failed";
      throw new Error(`#2735 owner-derivation guard failed:\n${detail}`, { cause: caught });
    }
    expect(stdout).toContain("#2735 owner-derivation guard");
  });
});
