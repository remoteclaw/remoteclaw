// Gutted in RemoteClaw fork (Middleware Boundary Principle)
export const buildAgentPrompt = (..._args: unknown[]): { message: string; history: unknown[] } => ({
  message: "",
  history: [],
});
