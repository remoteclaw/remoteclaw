import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { VoiceCallTtsConfig } from "./config.js";

export type CoreConfig = {
  session?: {
    store?: string;
  };
  messages?: {
    tts?: VoiceCallTtsConfig;
  };
  [key: string]: unknown;
};

/** Minimal ChannelMessage shape for building voice dispatch messages. */
type ChannelMessage = {
  id: string;
  text: string;
  from: string;
  channelId: string;
  provider: string;
  timestamp: number;
  replyToId?: string;
  messageToolHints?: string[];
  senderIsOwner?: boolean;
  toolProfile?: string;
};

/** Minimal AgentDeliveryResult shape returned by ChannelBridge.handle(). */
type AgentDeliveryResult = {
  payloads: Array<{ text?: string; isError?: boolean }>;
  run: { sessionId?: string; aborted?: boolean };
  mcp: unknown;
  error?: string;
};

/** Duck-typed SessionMap interface for the no-op adapter pattern. */
type SessionMapLike = {
  get(key: unknown): Promise<string | undefined>;
  set(key: unknown, sessionId: string): Promise<void>;
  delete(key: unknown): Promise<void>;
};

type CoreAgentDeps = {
  ChannelBridge: new (options: {
    provider: string;
    sessionMap: SessionMapLike;
    gatewayUrl: string;
    gatewayToken: string;
    workspaceDir?: string;
  }) => {
    handle(
      message: ChannelMessage,
      callbacks?: unknown,
      abortSignal?: AbortSignal,
    ): Promise<AgentDeliveryResult>;
  };
  resolveGatewayPort: (cfg?: CoreConfig) => number;
  resolveGatewayCredentialsFromConfig: (params: { cfg: CoreConfig; env?: NodeJS.ProcessEnv }) => {
    token?: string;
  };
  resolveAgentWorkspaceDir: (cfg: CoreConfig, agentId: string) => string;
  resolveAgentIdentity: (
    cfg: CoreConfig,
    agentId: string,
  ) => { name?: string | null } | null | undefined;
  ensureAgentWorkspace: (params?: { dir: string }) => Promise<void>;
  resolveStorePath: (store?: string, opts?: { agentId?: string }) => string;
  loadSessionStore: (storePath: string) => Record<string, unknown>;
  saveSessionStore: (storePath: string, store: Record<string, unknown>) => Promise<void>;
  DEFAULT_MODEL: string;
  DEFAULT_PROVIDER: string;
};

let coreRootCache: string | null = null;
let coreDepsPromise: Promise<CoreAgentDeps> | null = null;

function findPackageRoot(startDir: string, name: string): string | null {
  let dir = startDir;
  for (;;) {
    const pkgPath = path.join(dir, "package.json");
    try {
      if (fs.existsSync(pkgPath)) {
        const raw = fs.readFileSync(pkgPath, "utf8");
        const pkg = JSON.parse(raw) as { name?: string };
        if (pkg.name === name) {
          return dir;
        }
      }
    } catch {
      // ignore parse errors and keep walking
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}

function resolveOpenClawRoot(): string {
  if (coreRootCache) {
    return coreRootCache;
  }
  const override = process.env.REMOTECLAW_ROOT?.trim();
  if (override) {
    coreRootCache = override;
    return override;
  }

  const candidates = new Set<string>();
  if (process.argv[1]) {
    candidates.add(path.dirname(process.argv[1]));
  }
  candidates.add(process.cwd());
  try {
    const urlPath = fileURLToPath(import.meta.url);
    candidates.add(path.dirname(urlPath));
  } catch {
    // ignore
  }

  for (const start of candidates) {
    for (const name of ["openclaw"]) {
      const found = findPackageRoot(start, name);
      if (found) {
        coreRootCache = found;
        return found;
      }
    }
  }

  throw new Error("Unable to resolve core root. Set REMOTECLAW_ROOT to the package root.");
}

async function importCoreExtensionAPI(): Promise<{
  ChannelBridge: CoreAgentDeps["ChannelBridge"];
  resolveGatewayPort: CoreAgentDeps["resolveGatewayPort"];
  resolveGatewayCredentialsFromConfig: CoreAgentDeps["resolveGatewayCredentialsFromConfig"];
  resolveAgentWorkspaceDir: CoreAgentDeps["resolveAgentWorkspaceDir"];
  resolveAgentIdentity: CoreAgentDeps["resolveAgentIdentity"];
  ensureAgentWorkspace: CoreAgentDeps["ensureAgentWorkspace"];
  resolveStorePath: CoreAgentDeps["resolveStorePath"];
  loadSessionStore: CoreAgentDeps["loadSessionStore"];
  saveSessionStore: CoreAgentDeps["saveSessionStore"];
  DEFAULT_MODEL: string;
  DEFAULT_PROVIDER: string;
}> {
  // Do not import any other module. You can't touch this or you will be fired.
  const distPath = path.join(resolveOpenClawRoot(), "dist", "extensionAPI.js");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Missing core module at ${distPath}. Run \`pnpm build\` or install the official package.`,
    );
  }
  return await import(pathToFileURL(distPath).href);
}

export async function loadCoreAgentDeps(): Promise<CoreAgentDeps> {
  if (coreDepsPromise) {
    return coreDepsPromise;
  }

  coreDepsPromise = (async () => {
    return await importCoreExtensionAPI();
  })();

  return coreDepsPromise;
}
