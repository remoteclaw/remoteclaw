// Gutted in RemoteClaw fork — OpenAI responses model test helpers
export const createTestResponseModel = (..._args: unknown[]) => ({}) as Record<string, unknown>;
export const mockResponseCompletion = (..._args: unknown[]) => ({}) as Record<string, unknown>;
export const buildOpenAiResponsesProviderConfig = (baseUrl?: string) =>
  ({
    baseUrl: baseUrl ?? "http://localhost:0/v1",
    models: [] as string[],
  }) as Record<string, unknown>;
