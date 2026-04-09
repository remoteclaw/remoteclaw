// Gutted in RemoteClaw fork — OpenAI mock test helpers
export const createOpenAiMock = (..._args: unknown[]) => ({}) as Record<string, unknown>;
export const mockOpenAiChatCompletion = (..._args: unknown[]) => ({}) as Record<string, unknown>;
export const installOpenAiResponsesMock = (..._args: unknown[]) => ({
  baseUrl: "http://localhost:0",
  restore: () => {},
});
