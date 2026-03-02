import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

const DIGEST_PINNED_DOCKERFILES = [
  "Dockerfile",
  "scripts/e2e/Dockerfile",
  "scripts/e2e/Dockerfile.qr-import",
] as const;

describe("docker base image pinning", () => {
  it("pins selected Dockerfile FROM lines to immutable sha256 digests", async () => {
    for (const dockerfilePath of DIGEST_PINNED_DOCKERFILES) {
      const dockerfile = await readFile(resolve(repoRoot, dockerfilePath), "utf8");
      const fromLine = dockerfile
        .split(/\r?\n/)
        .find((line) => line.trimStart().startsWith("FROM "));
      expect(fromLine, `${dockerfilePath} should define a FROM line`).toBeDefined();
      expect(fromLine, `${dockerfilePath} FROM must be digest-pinned`).toMatch(
        /^FROM\s+\S+@sha256:[a-f0-9]{64}$/,
      );
    }
  });
});
