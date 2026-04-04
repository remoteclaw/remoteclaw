import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

async function makeLauncherFixture(fixtureRoots: string[]): Promise<string> {
  const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), "remoteclaw-launcher-"));
  fixtureRoots.push(fixtureRoot);
  await fs.copyFile(
    path.resolve(process.cwd(), "remoteclaw.mjs"),
    path.join(fixtureRoot, "remoteclaw.mjs"),
  );
  await fs.mkdir(path.join(fixtureRoot, "dist"), { recursive: true });
  return fixtureRoot;
}

describe("remoteclaw launcher", () => {
  const fixtureRoots: string[] = [];

  afterEach(async () => {
    await Promise.all(
      fixtureRoots.splice(0).map(async (fixtureRoot) => {
        await fs.rm(fixtureRoot, { recursive: true, force: true });
      }),
    );
  });

  it("surfaces transitive entry import failures instead of masking them as missing dist", async () => {
    const fixtureRoot = await makeLauncherFixture(fixtureRoots);
    await fs.writeFile(
      path.join(fixtureRoot, "dist", "entry.js"),
      'import "missing-remoteclaw-launcher-dep";\nexport {};\n',
      "utf8",
    );

    const result = spawnSync(
      process.execPath,
      [path.join(fixtureRoot, "remoteclaw.mjs"), "--help"],
      {
        cwd: fixtureRoot,
        encoding: "utf8",
      },
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("missing-remoteclaw-launcher-dep");
    expect(result.stderr).not.toContain("missing dist/entry.(m)js");
  });

  it("keeps the friendly launcher error for a truly missing entry build output", async () => {
    const fixtureRoot = await makeLauncherFixture(fixtureRoots);

    const result = spawnSync(
      process.execPath,
      [path.join(fixtureRoot, "remoteclaw.mjs"), "--help"],
      {
        cwd: fixtureRoot,
        encoding: "utf8",
      },
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("missing dist/entry.(m)js");
  });
});
