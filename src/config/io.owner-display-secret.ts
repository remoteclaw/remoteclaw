import type { RemoteClawConfig } from "./types.remoteclaw.js";

export type OwnerDisplaySecretRuntimeState = {
  pendingByPath: Map<string, string>;
};

export function retainGeneratedOwnerDisplaySecret(params: {
  config: RemoteClawConfig;
  configPath: string;
  generatedSecret?: string;
  state: OwnerDisplaySecretRuntimeState;
}): RemoteClawConfig {
  const { config, configPath, generatedSecret, state } = params;
  if (!generatedSecret) {
    state.pendingByPath.delete(configPath);
    return config;
  }

  state.pendingByPath.set(configPath, generatedSecret);
  return config;
}
