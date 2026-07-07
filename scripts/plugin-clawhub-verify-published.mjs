#!/usr/bin/env node

import { readFileSync } from "node:fs";
import process from "node:process";

const DEFAULT_REGISTRY = "https://clawhub.org";
const RETRY_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

function usage() {
  return "usage: node scripts/plugin-clawhub-verify-published.mjs <release-plan.json>";
}

function parsePlan(planPath) {
  const plan = JSON.parse(readFileSync(planPath, "utf8"));
  const entries = [...(plan.candidates ?? []), ...(plan.skippedPublished ?? [])];
  return entries
    .filter((entry) => typeof entry?.packageName === "string" && typeof entry?.version === "string")
    .map((entry) => ({
      packageName: entry.packageName,
      version: entry.version,
    }));
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchVersionStatus({ registry, packageName, version }) {
  const encodedName = encodeURIComponent(packageName);
  const encodedVersion = encodeURIComponent(version);
  const url = `${registry.replace(/\/+$/, "")}/api/v1/packages/${encodedName}/versions/${encodedVersion}`;

  let lastStatus = 0;
  let lastError = "";
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    try {
      const response = await fetch(url, { method: "GET" });
      lastStatus = response.status;
      if (response.ok) {
        return { ok: true, status: response.status, url };
      }
      if (!RETRY_STATUSES.has(response.status)) {
        break;
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await wait(5000 * attempt);
  }

  return { ok: false, status: lastStatus, error: lastError, url };
}

export async function verifyClawHubPublished(argv) {
  const planPath = argv[0];
  if (!planPath) {
    throw new Error(usage());
  }

  const registry = process.env.CLAWHUB_REGISTRY || DEFAULT_REGISTRY;
  const expected = parsePlan(planPath);
  if (expected.length === 0) {
    console.log("No ClawHub package versions to verify.");
    return;
  }

  const failures = [];
  for (const entry of expected) {
    const result = await fetchVersionStatus({ registry, ...entry });
    if (result.ok) {
      console.log(`Verified ClawHub package ${entry.packageName}@${entry.version}`);
      continue;
    }
    failures.push({ ...entry, ...result });
  }

  if (failures.length > 0) {
    throw new Error(
      `Missing or unavailable ClawHub package version(s):\n${failures
        .map((failure) => {
          const suffix = failure.error
            ? ` (${failure.error})`
            : failure.status
              ? ` (HTTP ${failure.status})`
              : "";
          return `- ${failure.packageName}@${failure.version}${suffix}`;
        })
        .join("\n")}`,
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await verifyClawHubPublished(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
