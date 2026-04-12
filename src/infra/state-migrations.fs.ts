/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from "node:fs";

// Gutted in RemoteClaw fork (Middleware Boundary Principle)
export function isLegacyWhatsAppAuthFile(..._args: unknown[]): boolean {
  return false;
}
export function readSessionStoreJson5(..._args: unknown[]): any {
  return undefined;
}
export type SessionEntryLike = any;
export function safeReadDir(..._args: unknown[]): any[] {
  return [];
}
export function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}
export function existsDir(dirPath: string): boolean {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}
export function fileExists(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}
