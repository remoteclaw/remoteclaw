import type { ChannelId } from "../channels/plugins/types.js";
import type { GatewayDaemonRuntime } from "./daemon-runtime.js";

export type OnboardMode = "local" | "remote";
export type AuthChoice =
  // Legacy alias for `setup-token` (kept for backwards CLI compatibility).
  | "oauth"
  | "setup-token"
  | "claude-cli"
  | "token"
  | "chutes"
  | "vllm"
  | "openai-codex"
  | "openai-api-key"
  | "openrouter-api-key"
  | "kilocode-api-key"
  | "litellm-api-key"
  | "ai-gateway-api-key"
  | "cloudflare-ai-gateway-api-key"
  | "moonshot-api-key"
  | "moonshot-api-key-cn"
  | "kimi-code-api-key"
  | "synthetic-api-key"
  | "venice-api-key"
  | "together-api-key"
  | "huggingface-api-key"
  | "codex-cli"
  | "apiKey"
  | "gemini-api-key"
  | "google-gemini-cli"
  | "zai-api-key"
  | "zai-coding-global"
  | "zai-coding-cn"
  | "zai-global"
  | "zai-cn"
  | "xiaomi-api-key"
  | "minimax-cloud"
  | "minimax"
  | "minimax-api"
  | "minimax-api-key-cn"
  | "minimax-api-lightning"
  | "minimax-portal"
  | "opencode-zen"
  | "github-copilot"
  | "copilot-proxy"
  | "qwen-portal"
  | "xai-api-key"
  | "mistral-api-key"
  | "volcengine-api-key"
  | "byteplus-api-key"
  | "qianfan-api-key"
  | "elevenlabs-api-key"
  | "custom-api-key"
  | "skip";
export type AuthChoiceGroupId =
  | "openai"
  | "anthropic"
  | "chutes"
  | "vllm"
  | "google"
  | "copilot"
  | "openrouter"
  | "kilocode"
  | "litellm"
  | "ai-gateway"
  | "cloudflare-ai-gateway"
  | "moonshot"
  | "zai"
  | "xiaomi"
  | "opencode-zen"
  | "minimax"
  | "synthetic"
  | "venice"
  | "mistral"
  | "qwen"
  | "together"
  | "huggingface"
  | "qianfan"
  | "xai"
  | "volcengine"
  | "byteplus"
  | "custom";
export type GatewayAuthChoice = "token" | "password";
export type ResetScope = "config" | "config+creds+sessions" | "full";
export type GatewayBind = "loopback" | "lan" | "auto" | "custom" | "tailnet";
export type TailscaleMode = "off" | "serve" | "funnel";
export type ChannelChoice = ChannelId;
// Legacy alias (pre-rename).
export type ProviderChoice = ChannelChoice;

export type AgentRuntime = "claude" | "gemini" | "codex" | "opencode";

export type OnboardOptions = {
  mode?: OnboardMode;
  /** "manual" is an alias for "advanced". */
  flow?: "quickstart" | "advanced" | "manual";
  workspace?: string;
  nonInteractive?: boolean;
  /** Required for non-interactive onboarding; skips the interactive risk prompt when true. */
  acceptRisk?: boolean;
  reset?: boolean;
  resetScope?: ResetScope;
  runtime?: AgentRuntime;
  anthropicApiKey?: string;
  openaiApiKey?: string;
  geminiApiKey?: string;
  codexApiKey?: string;
  /** Auth token (e.g., CLAUDE_CODE_OAUTH_TOKEN for Claude). */
  authToken?: string;
  // Provider API key fields (consumed by legacy auth-choice system via ONBOARD_PROVIDER_AUTH_FLAGS).
  mistralApiKey?: string;
  openrouterApiKey?: string;
  kilocodeApiKey?: string;
  litellmApiKey?: string;
  aiGatewayApiKey?: string;
  cloudflareAiGatewayApiKey?: string;
  moonshotApiKey?: string;
  kimiCodeApiKey?: string;
  zaiApiKey?: string;
  xiaomiApiKey?: string;
  minimaxApiKey?: string;
  syntheticApiKey?: string;
  veniceApiKey?: string;
  togetherApiKey?: string;
  huggingfaceApiKey?: string;
  opencodeZenApiKey?: string;
  xaiApiKey?: string;
  qianfanApiKey?: string;
  volcengineApiKey?: string;
  byteplusApiKey?: string;
  elevenLabsApiKey?: string;
  gatewayPort?: number;
  gatewayBind?: GatewayBind;
  gatewayAuth?: GatewayAuthChoice;
  gatewayToken?: string;
  gatewayPassword?: string;
  tailscale?: TailscaleMode;
  tailscaleResetOnExit?: boolean;
  installDaemon?: boolean;
  daemonRuntime?: GatewayDaemonRuntime;
  skipChannels?: boolean;
  skipHealth?: boolean;
  skipUi?: boolean;
  remoteUrl?: string;
  remoteToken?: string;
  json?: boolean;
};
