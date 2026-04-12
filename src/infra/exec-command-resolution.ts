import fs from "node:fs";
import {
  normalizeExecutableToken,
  unwrapKnownDispatchWrapperInvocation,
  unwrapKnownShellMultiplexerInvocation,
} from "./exec-wrapper-resolution.js";
import { resolveExecutablePath } from "./executable-path.js";

export type ExecutableResolution = {
  rawExecutable: string;
  resolvedPath?: string;
  resolvedRealPath?: string;
  executableName: string;
};

export type CommandResolution = {
  execution: ExecutableResolution;
  policy: ExecutableResolution;
  effectiveArgv?: string[];
  wrapperChain?: string[];
  policyBlocked?: boolean;
  blockedWrapper?: string;
  /** Convenience alias for execution.resolvedPath (used by fork callers). */
  resolvedPath?: string;
};

function tryResolveRealpath(filePath: string | undefined): string | undefined {
  if (!filePath) {
    return undefined;
  }
  try {
    return fs.realpathSync(filePath);
  } catch {
    return undefined;
  }
}

function resolveExecutableResolution(
  rawExecutable: string,
  cwd?: string,
  env?: NodeJS.ProcessEnv,
): ExecutableResolution {
  const executableName = normalizeExecutableToken(rawExecutable);
  const resolvedPath = resolveExecutablePath(rawExecutable, { cwd, env });
  const resolvedRealPath = tryResolveRealpath(resolvedPath);
  return {
    rawExecutable,
    resolvedPath,
    resolvedRealPath,
    executableName,
  };
}

function unwrapToEffectiveArgv(argv: string[]): {
  effectiveArgv: string[];
  wrapperChain: string[];
} {
  let current = argv;
  const wrapperChain: string[] = [];
  let iterations = 0;
  const maxDepth = 4;
  while (iterations < maxDepth) {
    const dispatch = unwrapKnownDispatchWrapperInvocation(current);
    if (dispatch.kind === "unwrapped") {
      wrapperChain.push(current[0] ?? "");
      current = dispatch.argv;
      iterations++;
      continue;
    }
    const shellMux = unwrapKnownShellMultiplexerInvocation(current);
    if (shellMux.kind === "unwrapped") {
      wrapperChain.push(current[0] ?? "");
      current = shellMux.argv;
      iterations++;
      continue;
    }
    break;
  }
  return { effectiveArgv: current, wrapperChain };
}

export function resolveCommandResolutionFromArgv(
  argv: string[],
  cwd?: string,
  env?: NodeJS.ProcessEnv,
): CommandResolution | null {
  const { effectiveArgv, wrapperChain } = unwrapToEffectiveArgv(argv);
  const rawExecutable = effectiveArgv[0]?.trim();
  if (!rawExecutable) {
    return null;
  }
  const execution = resolveExecutableResolution(rawExecutable, cwd, env);
  return {
    execution,
    policy: execution,
    effectiveArgv,
    wrapperChain,
    resolvedPath: execution.resolvedPath,
  };
}
