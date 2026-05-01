// Stub — gutted in RemoteClaw fork (Middleware Boundary Principle)

export type ReasoningLaneCoordinator = Record<string, unknown>;

export const createReasoningLaneCoordinator = (..._args: unknown[]) => ({}) as ReasoningLaneCoordinator;
export const createTelegramReasoningStepState = (..._args: unknown[]) => ({
  noteReasoningHint: () => {},
  noteReasoningDelivered: () => {},
  takeBufferedFinalAnswer: () => undefined as string | undefined,
  resetForNextStep: () => {},
  shouldBufferFinalAnswer: () => false,
  bufferFinalAnswer: (_payload: unknown) => {},
});
export const splitTelegramReasoningText = (..._args: unknown[]) =>
  ({ main: "", reasoning: "", reasoningText: "", answerText: "" }) as {
    main: string;
    reasoning: string;
    reasoningText: string;
    answerText: string;
  };
