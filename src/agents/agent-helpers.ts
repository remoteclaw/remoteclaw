export { stripThoughtSignatures } from "./agent-helpers/message-sanitization.js";
export {
  BILLING_ERROR_USER_MESSAGE,
  formatBillingErrorMessage,
  classifyFailoverReason,
  formatRawAssistantErrorForUi,
  formatAssistantErrorText,
  getApiErrorPayloadFingerprint,
  isAuthAssistantError,
  isAuthErrorMessage,
  isModelNotFoundErrorMessage,
  isBillingAssistantError,
  parseApiErrorInfo,
  sanitizeUserFacingText,
  isBillingErrorMessage,
  isCloudflareOrHtmlErrorPage,
  isCloudCodeAssistFormatError,
  isCompactionFailureError,
  isContextOverflowError,
  isLikelyContextOverflowError,
  isFailoverAssistantError,
  isFailoverErrorMessage,
  isImageDimensionErrorMessage,
  isImageSizeError,
  isOverloadedErrorMessage,
  isRawApiErrorPayload,
  isRateLimitAssistantError,
  isRateLimitErrorMessage,
  isTransientHttpError,
  isTimeoutErrorMessage,
  parseImageDimensionError,
  parseImageSizeError,
} from "./agent-helpers/errors.js";
export { isGoogleModelApi, sanitizeGoogleTurnOrdering } from "./agent-helpers/google.js";

export { downgradeOpenAIReasoningBlocks } from "./agent-helpers/openai.js";
export {
  isEmptyAssistantMessageContent,
  sanitizeSessionMessagesImages,
} from "./agent-helpers/images.js";
export {
  isMessagingToolDuplicate,
  isMessagingToolDuplicateNormalized,
  normalizeTextForComparison,
} from "./agent-helpers/messaging-dedupe.js";

export { pickFallbackThinkingLevel } from "./agent-helpers/thinking.js";

export {
  mergeConsecutiveUserTurns,
  validateAnthropicTurns,
  validateGeminiTurns,
} from "./agent-helpers/turns.js";
export type { FailoverReason } from "./agent-helpers/types.js";

export type { ToolCallIdMode } from "./tool-call-id.js";
export { isValidCloudCodeAssistToolId, sanitizeToolCallId } from "./tool-call-id.js";
