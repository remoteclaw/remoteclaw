// Checks required external binaries before dependent workflows run.
import { runExec } from "../process/exec.js";
import { defaultRuntime, type RuntimeEnv } from "../runtime.js";
import { resolvePathLookupCommand } from "./path-lookup.js";

export async function ensureBinary(
  name: string,
  exec: typeof runExec = runExec,
  runtime: RuntimeEnv = defaultRuntime,
): Promise<void> {
  // Abort early if a required CLI tool is missing. The lookup command is
  // platform-resolved — a hardcoded `which` reports every binary as missing on
  // Windows, where the command does not exist.
  await exec(resolvePathLookupCommand(), [name]).catch(() => {
    runtime.error(`Missing required binary: ${name}. Please install it.`);
    runtime.exit(1);
  });
}
