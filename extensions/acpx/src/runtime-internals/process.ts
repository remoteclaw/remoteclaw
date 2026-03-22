import { spawn } from "node:child_process";

export type SpawnCommandOptions = {
  strictWindowsCmdWrapper?: boolean;
  cache?: unknown;
  onResolved?: (event: unknown) => void;
};

export async function spawnAndCollect(
  params: {
    command: string;
    args: string[];
    cwd: string;
    stripProviderAuthEnvVars?: boolean;
  },
  _options?: SpawnCommandOptions,
  runtime?: {
    signal?: AbortSignal;
  },
): Promise<{
  stdout: string;
  stderr: string;
  code: number | null;
  error: Error | null;
}> {
  if (runtime?.signal?.aborted) {
    return { stdout: "", stderr: "", code: null, error: new Error("aborted") };
  }

  const [cmd, ...prefixArgs] = params.command.split(/\s+/);
  const args = [...prefixArgs, ...params.args];

  return new Promise((resolve) => {
    try {
      const child = spawn(cmd, args, {
        cwd: params.cwd,
        stdio: ["ignore", "pipe", "pipe"],
        env: process.env,
        shell: process.platform === "win32",
      });

      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];

      child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
      child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));

      child.on("error", (error) => {
        resolve({
          stdout: Buffer.concat(stdout).toString("utf8"),
          stderr: Buffer.concat(stderr).toString("utf8"),
          code: null,
          error,
        });
      });

      child.on("close", (code) => {
        resolve({
          stdout: Buffer.concat(stdout).toString("utf8"),
          stderr: Buffer.concat(stderr).toString("utf8"),
          code,
          error: null,
        });
      });
    } catch (error) {
      resolve({
        stdout: "",
        stderr: "",
        code: null,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  });
}
