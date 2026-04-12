/* eslint-disable @typescript-eslint/no-explicit-any */
// Gutted in RemoteClaw fork (Middleware Boundary Principle)
export class EmbeddedBlockChunker {
  feed(..._args: unknown[]) {}
  flush(..._args: unknown[]): unknown[] {
    return [];
  }
  reset(..._args: unknown[]) {}
  append(..._args: unknown[]) {}
  drain(..._args: unknown[]) {}
  hasBuffered(..._args: unknown[]): boolean {
    return false;
  }
}
