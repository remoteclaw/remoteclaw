import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import baseConfig, {
  resolveDefaultVitestPool,
  resolveLocalVitestMaxWorkers,
  resolveLocalVitestScheduling,
} from "../../test/vitest/vitest.config.ts";
import { parseVitestProcessStats } from "../../test/vitest/vitest.system-load.ts";

function normalizeConfigPath(value: unknown): string {
  return String(value).replaceAll("\\", "/");
}

describe("resolveLocalVitestMaxWorkers", () => {
  it("uses a moderate local worker cap on larger hosts", () => {
    expect(
      resolveLocalVitestMaxWorkers(
        {
          RUNNER_OS: "macOS",
        },
        {
          cpuCount: 10,
          loadAverage1m: 0,
          totalMemoryBytes: 64 * 1024 ** 3,
        },
        "threads",
      ),
    ).toBe(6);
  });

  it("lets REMOTECLAW_VITEST_MAX_WORKERS override the inferred cap", () => {
    expect(
      resolveLocalVitestMaxWorkers(
        {
          REMOTECLAW_VITEST_MAX_WORKERS: "2",
        },
        {
          cpuCount: 10,
          loadAverage1m: 0,
          totalMemoryBytes: 128 * 1024 ** 3,
        },
        "threads",
      ),
    ).toBe(2);
  });

  it("respects the legacy REMOTECLAW_TEST_WORKERS override too", () => {
    expect(
      resolveLocalVitestMaxWorkers(
        {
          REMOTECLAW_TEST_WORKERS: "3",
        },
        {
          cpuCount: 16,
          loadAverage1m: 0,
          totalMemoryBytes: 128 * 1024 ** 3,
        },
        "threads",
      ),
    ).toBe(3);
  });

  it("keeps memory-constrained hosts conservative", () => {
    expect(
      resolveLocalVitestMaxWorkers(
        {},
        {
          cpuCount: 16,
          loadAverage1m: 0,
          totalMemoryBytes: 16 * 1024 ** 3,
        },
        "threads",
      ),
    ).toBe(2);
  });

  it("lets roomy hosts use more local parallelism", () => {
    expect(
      resolveLocalVitestMaxWorkers(
        {},
        {
          cpuCount: 16,
          loadAverage1m: 0,
          totalMemoryBytes: 128 * 1024 ** 3,
        },
        "threads",
      ),
    ).toBe(8);
  });

  it("backs off further when the host is already busy", () => {
    expect(
      resolveLocalVitestMaxWorkers(
        {},
        {
          cpuCount: 16,
          loadAverage1m: 16,
          totalMemoryBytes: 128 * 1024 ** 3,
        },
        "threads",
      ),
    ).toBe(2);
  });

  it("caps very large hosts at six local workers", () => {
    expect(
      resolveLocalVitestMaxWorkers(
        {},
        {
          cpuCount: 32,
          loadAverage1m: 0,
          totalMemoryBytes: 256 * 1024 ** 3,
        },
        "threads",
      ),
    ).toBe(12);
  });
});

describe("resolveLocalVitestScheduling", () => {
  it("scales back to half capacity when the host load is already saturated", () => {
    expect(
      resolveLocalVitestScheduling(
        {},
        {
          cpuCount: 16,
          loadAverage1m: 16,
          totalMemoryBytes: 128 * 1024 ** 3,
        },
        "threads",
      ),
    ).toEqual({
      maxWorkers: 2,
      fileParallelism: true,
      throttledBySystem: true,
    });
  });

  it("keeps big hosts parallel under moderate host contention", () => {
    expect(
      resolveLocalVitestScheduling(
        {},
        {
          cpuCount: 16,
          loadAverage1m: 12,
          totalMemoryBytes: 128 * 1024 ** 3,
        },
        "threads",
      ),
    ).toEqual({
      maxWorkers: 5,
      fileParallelism: true,
      throttledBySystem: true,
    });
  });

  it("allows disabling the system throttle probe explicitly", () => {
    expect(
      resolveLocalVitestScheduling(
        {
          REMOTECLAW_VITEST_DISABLE_SYSTEM_THROTTLE: "1",
        },
        {
          cpuCount: 16,
          loadAverage1m: 0.5,
          totalMemoryBytes: 128 * 1024 ** 3,
        },
        "threads",
      ),
    ).toEqual({
      maxWorkers: 8,
      fileParallelism: true,
      throttledBySystem: false,
    });
  });
});

describe("parseVitestProcessStats", () => {
  it("counts other Vitest roots and workers while excluding the current pid", () => {
    expect(
      parseVitestProcessStats(
        [
          "101 0.0 node /Users/me/project/node_modules/.bin/vitest run --config vitest.config.ts",
          "102 41.3 /opt/homebrew/bin/node /Users/me/project/node_modules/vitest/dist/workers/forks.js",
          "103 37.4 /opt/homebrew/bin/node /Users/me/project/node_modules/vitest/dist/workers/forks.js",
          "200 12.0 node /Users/me/project/node_modules/.bin/vitest run --config test/vitest/vitest.unit.config.ts",
          "201 25.5 node unrelated-script.mjs",
        ].join("\n"),
        200,
      ),
    ).toEqual({
      otherVitestRootCount: 1,
      otherVitestWorkerCount: 2,
      otherVitestCpuPercent: 78.7,
    });
  });
});

describe("base vitest config", () => {
  it("defaults the base pool to threads", () => {
    expect(resolveDefaultVitestPool()).toBe("threads");
    expect(baseConfig.test?.pool).toBe("threads");
  });

  it("excludes fixture trees from test collection", () => {
    expect(baseConfig.test?.exclude).toContain("test/fixtures/**");
  });

  it("keeps the base setup file minimal", () => {
    expect(baseConfig.test?.setupFiles).toHaveLength(1);
    expect(normalizeConfigPath(baseConfig.test?.setupFiles?.[0])).toMatch(
      /(?:^|\/)test\/setup\.ts$/u,
    );
  });

  it("keeps the base runner non-isolated by default", () => {
    expect(baseConfig.test?.isolate).toBe(false);
    expect(normalizeConfigPath(baseConfig.test?.runner)).toMatch(
      /(?:^|\/)test\/non-isolated-runner\.ts$/u,
    );
  });
});

describe("test scripts", () => {
  it("keeps test scripts on the native thread-first configs", () => {
    const pkg = JSON.parse(
      readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
    ) as {
      scripts?: Record<string, string>;
    };

    // The fork drives tests through scripts/test-parallel.mjs against the root vitest.*.config.ts
    // configs (thread-first by default; the gateway lane opts into forks for process isolation).
    // It did not adopt upstream's scripts/test-projects*.mjs + scripts/run-vitest.mjs +
    // test/vitest/*.config.ts script wiring, so the serial/max/perf/unit-fast variants do not exist.
    expect(pkg.scripts?.["test"]).toBe("node scripts/test-parallel.mjs");
    expect(pkg.scripts?.["test:fast"]).toBe("vitest run --config vitest.unit.config.ts");
    expect(pkg.scripts?.["test:force"]).toBe("node --import tsx scripts/test-force.ts");
    expect(pkg.scripts?.["test:gateway"]).toBe(
      "vitest run --config vitest.gateway.config.ts --pool=forks",
    );
    expect(pkg.scripts?.["test:single"]).toBeUndefined();
  });
});
