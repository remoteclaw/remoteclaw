// Gutted in RemoteClaw fork (Middleware Boundary Principle)
export type MemorySourceStatus = {
  name: string;
  available: boolean;
};
export type MemoryStatus = Record<string, unknown>;
export type MemoryProviderStatus = {
  files?: number;
  chunks?: number;
  dirty?: boolean;
  sources?: string[];
  vector?: { state?: string; tone?: string; [key: string]: unknown };
  fts?: { state?: string; tone?: string; [key: string]: unknown };
  cache?: { tone?: string; text?: string; [key: string]: unknown };
  [key: string]: unknown;
};
