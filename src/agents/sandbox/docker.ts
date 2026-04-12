// Gutted in RemoteClaw fork (Middleware Boundary Principle)
export const execDockerRaw = async (
  ..._args: unknown[]
): Promise<{ code: number; stdout: Buffer; stderr: Buffer }> => ({
  code: 1,
  stdout: Buffer.alloc(0),
  stderr: Buffer.from("docker not available"),
});
