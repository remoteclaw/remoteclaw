/**
 * Minimal executable safety check for RemoteClaw fork.
 *
 * Rejects values containing obvious shell metacharacters that indicate
 * command injection (`;`, `|`, `&`, backticks, `$(`, `>`, `<`).
 */
export function isSafeExecutableValue(value: string): boolean {
  if (!value || typeof value !== "string") {
    return false;
  }
  // Reject shell metacharacters that indicate injection
  return !/[;|&`$()<>]/.test(value);
}
