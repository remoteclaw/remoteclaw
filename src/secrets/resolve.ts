// Gutted in RemoteClaw fork (Middleware Boundary Principle)
// Minimal env/file/exec-source resolution for CLI commands that resolve SecretRefs
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import type { SecretRef } from "../config/types.secrets.js";

type SecretRefLike = { source?: string; id?: string; provider?: string };
type ResolveOpts = {
  env?: Record<string, string | undefined>;
  config?: { secrets?: { providers?: Record<string, unknown> } };
};

function refKey(ref: SecretRefLike): string {
  return `${ref.source}:${ref.provider ?? "default"}:${ref.id}`;
}

function resolveEnvRefs(
  refs: SecretRefLike[],
  env: Record<string, string | undefined>,
  result: Map<string, unknown>,
): void {
  for (const ref of refs) {
    if (ref.source === "env" && typeof ref.id === "string") {
      const value = env[ref.id];
      if (value !== undefined) {
        result.set(refKey(ref), value);
      }
    }
  }
}

async function resolveFileRefs(
  refs: SecretRefLike[],
  config: ResolveOpts["config"],
  result: Map<string, unknown>,
): Promise<void> {
  for (const ref of refs) {
    if (ref.source !== "file" || typeof ref.id !== "string") {
      continue;
    }
    const providerName = ref.provider ?? "default";
    const provider = config?.secrets?.providers?.[providerName] as
      | { source?: string; path?: string; mode?: string }
      | undefined;
    if (!provider || provider.source !== "file" || typeof provider.path !== "string") {
      continue;
    }
    try {
      const content = await readFile(provider.path, "utf-8");
      const mode = provider.mode ?? "singleValue";
      if (mode === "json") {
        const parsed = JSON.parse(content);
        const segments = ref.id.startsWith("/") ? ref.id.slice(1).split("/") : [ref.id];
        let value: unknown = parsed;
        for (const seg of segments) {
          if (value == null || typeof value !== "object") {
            value = undefined;
            break;
          }
          value = (value as Record<string, unknown>)[seg];
        }
        if (value !== undefined) {
          result.set(refKey(ref), value);
        }
      } else {
        result.set(refKey(ref), content.trim());
      }
    } catch {
      // File not found or read error — leave unresolved
    }
  }
}

async function resolveExecRefs(
  refs: SecretRefLike[],
  config: ResolveOpts["config"],
  env: Record<string, string | undefined>,
  result: Map<string, unknown>,
): Promise<void> {
  // Group refs by provider
  const byProvider = new Map<string, SecretRefLike[]>();
  for (const ref of refs) {
    if (ref.source !== "exec" || typeof ref.id !== "string") {
      continue;
    }
    const providerName = ref.provider ?? "default";
    const group = byProvider.get(providerName) ?? [];
    group.push(ref);
    byProvider.set(providerName, group);
  }

  for (const [providerName, providerRefs] of byProvider) {
    const provider = config?.secrets?.providers?.[providerName] as
      | {
          source?: string;
          command?: string;
          args?: string[];
          env?: Record<string, string>;
          passEnv?: string[];
          allowInsecurePath?: boolean;
          allowSymlinkCommand?: boolean;
        }
      | undefined;
    if (!provider || provider.source !== "exec" || typeof provider.command !== "string") {
      continue;
    }
    const ids = providerRefs.map((r) => r.id as string);
    const stdinPayload = JSON.stringify({ protocolVersion: 1, ids });
    const childEnv: Record<string, string> = { ...provider.env };
    if (provider.passEnv) {
      for (const key of provider.passEnv) {
        const value = env[key];
        if (value !== undefined) {
          childEnv[key] = value;
        }
      }
    }
    try {
      const stdout = await new Promise<string>((resolve, reject) => {
        const child = execFile(
          provider.command!,
          provider.args ?? [],
          {
            timeout: 30_000,
            maxBuffer: 4 * 1024 * 1024,
            env: { ...process.env, ...childEnv },
          },
          (error, stdout) => {
            if (error) {
              reject(error);
            } else {
              resolve(stdout);
            }
          },
        );
        child.stdin?.write(stdinPayload);
        child.stdin?.end();
      });
      const parsed = JSON.parse(stdout);
      if (parsed && typeof parsed === "object" && parsed.values) {
        for (const ref of providerRefs) {
          const value = parsed.values[ref.id as string];
          if (value !== undefined) {
            result.set(refKey(ref), value);
          }
        }
      }
    } catch {
      // Exec failed — leave refs unresolved
    }
  }
}

export const resolveSecretRefValues = async (
  refs: Array<SecretRefLike>,
  opts?: ResolveOpts,
): Promise<Map<string, unknown>> => {
  const result = new Map<string, unknown>();
  const env = (opts?.env ?? process.env) as Record<string, string | undefined>;
  const envRefs = refs.filter((r) => r.source === "env");
  const fileRefs = refs.filter((r) => r.source === "file");
  const execRefs = refs.filter((r) => r.source === "exec");

  resolveEnvRefs(envRefs, env, result);
  if (fileRefs.length > 0) {
    await resolveFileRefs(fileRefs, opts?.config, result);
  }
  if (execRefs.length > 0) {
    await resolveExecRefs(execRefs, opts?.config, env, result);
  }
  return result;
};

export async function resolveSecretRefString(ref: SecretRef, opts?: ResolveOpts): Promise<string> {
  const resolved = await resolveSecretRefValues([ref], opts);
  const key = refKey(ref);
  const value = resolved.get(key);
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(
      `Secret reference "${ref.source}:${ref.provider}:${ref.id}" resolved to a non-string or empty value.`,
    );
  }
  return value;
}

export const resolveSecretValue = (..._args: unknown[]) => undefined as unknown;
export const resolveSecretRef = (..._args: unknown[]) => undefined as unknown;
export const resolveAllSecrets = (..._args: unknown[]) => undefined as unknown;
