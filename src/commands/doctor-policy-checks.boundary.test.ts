import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Structural guard for the §D security boundary of the policy-doctor adoption:
//   - `detect` is pure-read (the ext's check registry issues NO filesystem/config
//     writes),
//   - the repair reducer performs NO I/O (it threads config forward; the caller
//     persists via the doctor's pre-existing `writeConfigFile` path),
//   - the core wiring writes nothing itself and invokes repair only under `--fix`.
// These are source-level invariants: if a future edit smuggles a write primitive
// onto the detect path or ungates the repair, this test fails.

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel: string): string => readFileSync(join(repoRoot, rel), "utf-8");

// Scan CODE only — a write primitive named in a comment (e.g. documenting the
// existing `writeConfigFile` persistence path) is not a write. Block comments are
// removed; line comments are removed except where the `//` is part of a `scheme://`
// token (policy findings embed `oc://…` requirement paths).
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

// Filesystem/config mutation primitives. `readFile`/`readFileSync` are intentionally
// absent — reads are the detect path's whole job.
const WRITE_PRIMITIVES =
  /\b(writeFile|writeFileSync|appendFile|appendFileSync|unlink|unlinkSync|rmdir|mkdir|mkdirSync|rename|renameSync|truncate|copyFile|symlink|writeConfigFile|createWriteStream)\b|\bfs\.rm\b|\brm\(/;

describe("policy doctor bounded-write boundary", () => {
  it("the ext check registry (detect path) issues no write primitives", () => {
    const code = stripComments(read("extensions/policy/src/doctor/register.ts"));
    expect(code).not.toMatch(WRITE_PRIMITIVES);
  });

  it("the ext exposes exactly one repair() across all health checks", () => {
    const code = read("extensions/policy/src/doctor/register.ts");
    const repairDefs = code.match(/^\s*async repair\(/gm) ?? [];
    expect(repairDefs).toHaveLength(1);
  });

  it("the repair reducer performs no I/O (pure config threading)", () => {
    const code = stripComments(read("src/plugin-sdk/_health/repair-runner.ts"));
    expect(code).not.toMatch(WRITE_PRIMITIVES);
  });

  it("the core wiring never writes and gates repair behind --fix", () => {
    const raw = read("src/commands/doctor-policy-checks.ts");
    const code = stripComments(raw);
    expect(code).not.toMatch(WRITE_PRIMITIVES);

    // Repair is invoked exactly once, only inside the `shouldRepair` guard.
    const repairCalls = code.match(/runDoctorHealthRepairs\(/g) ?? [];
    expect(repairCalls).toHaveLength(1);
    const guardIdx = code.indexOf("if (prompter.shouldRepair)");
    const callIdx = code.indexOf("runDoctorHealthRepairs(");
    expect(guardIdx).toBeGreaterThanOrEqual(0);
    expect(callIdx).toBeGreaterThan(guardIdx);
  });
});
