// Stub — gutted in RemoteClaw fork (Middleware Boundary Principle)
export const resolveDiscordExecApprovals = (..._args: unknown[]) => undefined as unknown;

export type ExecApprovalRequest = Record<string, unknown>;
export type ExecApprovalButtonContext = Record<string, unknown>;

export const buildExecApprovalCustomId = (..._args: unknown[]) => "" as string;
export const extractDiscordChannelId = (..._args: unknown[]) => "" as string;
export const parseExecApprovalData = (..._args: unknown[]) => ({}) as Record<string, unknown>;
export class DiscordExecApprovalHandler {
  _stub = true; // Accept constructor args via property declaration pattern
  constructor(..._args: unknown[]) {
    this._stub = true;
  }
  shouldHandle(..._args: unknown[]): boolean {
    return false;
  }
  getApprovers(..._args: unknown[]): unknown[] {
    return [];
  }
  resolveApproval(..._args: unknown[]): unknown {
    return undefined;
  }
}
export class ExecApprovalButton {
  _stub = true;
  constructor(..._args: unknown[]) {
    this._stub = true;
  }
  run(..._args: unknown[]): Promise<void> {
    return Promise.resolve();
  }
}
