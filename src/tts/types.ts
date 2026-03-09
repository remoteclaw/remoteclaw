export type TtsSynthesisRequest = {
  text: string;
  voice?: string;
  model?: string;
  apiKey?: string;
  outputFormat?: string;
  speed?: number;
  timeoutMs: number;
  /** Provider-specific options. */
  extras?: Record<string, unknown>;
};

export type TtsSynthesisResult = {
  audioBuffer: Buffer;
  format: string;
  sampleRate?: number;
};

export type TtsProviderImpl = {
  id: string;
  synthesize: (req: TtsSynthesisRequest) => Promise<TtsSynthesisResult>;
  readonly requiresApiKey: boolean;
};
