process.env.REMOTECLAW_VITEST_IMPORT_DURATIONS = "1";
process.env.REMOTECLAW_VITEST_PRINT_IMPORT_BREAKDOWN = "1";

await import("./test-projects.mjs");
