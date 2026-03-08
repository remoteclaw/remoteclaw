export type MediaUnderstandingKind =
  | "audio.transcription"
  | "video.description"
  | "image.description";

export type MediaUnderstandingCapability = "image" | "audio" | "video";

export type MediaAttachment = {
  path?: string;
  url?: string;
  mime?: string;
  index: number;
  alreadyTranscribed?: boolean;
};

export type MediaUnderstandingOutput = {
  kind: MediaUnderstandingKind;
  attachmentIndex: number;
  text: string;
  provider: string;
  model?: string;
};

export type MediaUnderstandingDecisionOutcome =
  | "success"
  | "skipped"
  | "disabled"
  | "no-attachment"
  | "scope-deny";

export type MediaUnderstandingModelDecision = {
  provider?: string;
  model?: string;
  type: "provider" | "cli";
  outcome: "success" | "skipped" | "failed";
  reason?: string;
};

export type MediaUnderstandingAttachmentDecision = {
  attachmentIndex: number;
  attempts: MediaUnderstandingModelDecision[];
  chosen?: MediaUnderstandingModelDecision;
};

export type MediaUnderstandingDecision = {
  capability: MediaUnderstandingCapability;
  outcome: MediaUnderstandingDecisionOutcome;
  attachments: MediaUnderstandingAttachmentDecision[];
};

import type {
  AudioTranscriptionRequest as _AudioTranscriptionRequest,
  AudioTranscriptionResult as _AudioTranscriptionResult,
} from "../stt/types.js";

export type AudioTranscriptionRequest = _AudioTranscriptionRequest;
export type AudioTranscriptionResult = _AudioTranscriptionResult;

export type VideoDescriptionRequest = {
  buffer: Buffer;
  fileName: string;
  mime?: string;
  apiKey: string;
  baseUrl?: string;
  headers?: Record<string, string>;
  model?: string;
  prompt?: string;
  timeoutMs: number;
  fetchFn?: typeof fetch;
};

export type VideoDescriptionResult = {
  text: string;
  model?: string;
};

export type MediaUnderstandingProvider = {
  id: string;
  capabilities?: MediaUnderstandingCapability[];
  transcribeAudio?: (req: AudioTranscriptionRequest) => Promise<AudioTranscriptionResult>;
  describeVideo?: (req: VideoDescriptionRequest) => Promise<VideoDescriptionResult>;
};
