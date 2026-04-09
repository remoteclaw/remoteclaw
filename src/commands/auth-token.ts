// Gutted in RemoteClaw fork (Middleware Boundary Principle)
// Original re-exports from plugins/provider-auth-token which is gutted

export const ANTHROPIC_SETUP_TOKEN_MIN_LENGTH = 10;
export const ANTHROPIC_SETUP_TOKEN_PREFIX = "sk-ant-";
export const DEFAULT_TOKEN_PROFILE_NAME = "default";
export const buildTokenProfileId = (..._args: unknown[]) => "default" as string;
export const normalizeTokenProfileName = (..._args: unknown[]) => "default" as string;
export const validateAnthropicSetupToken = (..._args: unknown[]) => true as boolean;
