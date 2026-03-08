export const DEFAULT_AUDIO_MODELS: Record<string, string> = {
  groq: "whisper-large-v3-turbo",
  openai: "gpt-4o-mini-transcribe",
  deepgram: "nova-3",
  mistral: "voxtral-mini-latest",
};

export const AUTO_AUDIO_KEY_PROVIDERS = [
  "openai",
  "groq",
  "deepgram",
  "google",
  "mistral",
] as const;
