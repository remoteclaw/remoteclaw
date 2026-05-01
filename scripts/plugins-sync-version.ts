#!/usr/bin/env -S node --import tsx

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

type PackageJson = {
  name?: string;
  version?: string;
};

function main() {
  const rootPackagePath = resolve("package.json");
  const rootPackage = JSON.parse(readFileSync(rootPackagePath, "utf8")) as PackageJson;
  const targetVersion = rootPackage.version;

  if (!targetVersion) {
    console.error("plugins-sync-version: root package.json missing version.");
    process.exit(1);
  }

  const extensionsDir = resolve("extensions");
  const entries = readdirSync(extensionsDir, { withFileTypes: true }).filter((entry) =>
    entry.isDirectory(),
  );

  let updated = 0;

  for (const entry of entries) {
    const packagePath = join(extensionsDir, entry.name, "package.json");
    let pkg: PackageJson;
    try {
      pkg = JSON.parse(readFileSync(packagePath, "utf8")) as PackageJson;
    } catch {
      continue;
    }

    if (!pkg.name || !pkg.version) {
      continue;
    }

    if (pkg.version !== targetVersion) {
      pkg.version = targetVersion;
      writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + "\n");
      updated++;
    }
  }

  console.log(`plugins-sync-version: ${updated} extension(s) synced to ${targetVersion}.`);
}

main();
