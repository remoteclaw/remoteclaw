import fs from "node:fs";
import path from "node:path";

/**
 * Vitest/Vite source-resolution aliases for the adopted `@remoteclaw/*`
 * workspace packages (ADR-0020 `packages/*` monorepo).
 *
 * Each package's `exports` map points at built `./dist/*.mjs` artifacts that the
 * test lanes never build (CI's test job runs no package build — only the build
 * job does). Typecheck resolves these imports to source via `tsconfig.json`
 * path maps; the test runners need the equivalent, so we alias every declared
 * export back to its `packages/<pkg>/src/**.ts` source — mirroring the
 * `remoteclaw/plugin-sdk` alias convention.
 *
 * Aliases are derived from each `package.json` `exports` so newly-added subpaths
 * are picked up automatically. The source path is reconstructed from the export
 * target's own shape, not its key, so nested layouts resolve correctly
 * (e.g. llm-core's `./diagnostics` → `./dist/utils/diagnostics.mjs` →
 * `src/utils/diagnostics.ts`, acp-core's `./runtime/types` → `src/runtime/types.ts`).
 *
 * @param {string} repoRoot Absolute path to the repository root.
 * @returns {Array<{ find: string; replacement: string }>} Ordered alias entries.
 */
export function corePackageAliases(repoRoot) {
  const packagesDir = path.join(repoRoot, "packages");
  const aliases = [];
  for (const entry of fs.readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const packageDir = path.join(packagesDir, entry.name);
    let pkg;
    try {
      pkg = JSON.parse(fs.readFileSync(path.join(packageDir, "package.json"), "utf8"));
    } catch {
      continue;
    }
    if (typeof pkg.name !== "string" || !pkg.name.startsWith("@remoteclaw/")) {
      continue;
    }
    for (const [exportKey, exportValue] of Object.entries(pkg.exports ?? {})) {
      const target =
        typeof exportValue === "string"
          ? exportValue
          : (exportValue?.import ?? exportValue?.default);
      if (typeof target !== "string") {
        continue;
      }
      const sourceRelative = target.replace(/^\.\/dist\//u, "").replace(/\.m?js$/u, "");
      const segments = sourceRelative.split("/");
      segments[segments.length - 1] = `${segments[segments.length - 1]}.ts`;
      const find = exportKey === "." ? pkg.name : `${pkg.name}/${exportKey.slice(2)}`;
      aliases.push({ find, replacement: path.join(packageDir, "src", ...segments) });
    }
  }
  // Most-specific first: a string alias matches the exact id AND any `id/`-prefixed
  // subpath, so barrels (shorter finds) must be evaluated after their subpaths.
  aliases.sort((left, right) => right.find.length - left.find.length);
  return aliases;
}
