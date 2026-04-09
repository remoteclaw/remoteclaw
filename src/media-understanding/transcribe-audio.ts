// Gutted in RemoteClaw fork (Middleware Boundary Principle)
export type TranscribeAudioOptions = Record<string, unknown>;
export type TranscribeAudioResult = { text: string };
export const transcribeAudio = (..._args: unknown[]): Promise<TranscribeAudioResult> =>
  Promise.resolve({ text: "" });
export const transcribeAudioFile = (..._args: unknown[]): Promise<TranscribeAudioResult> =>
  Promise.resolve({ text: "" });
