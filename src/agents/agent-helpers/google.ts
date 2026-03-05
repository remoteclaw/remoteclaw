import { sanitizeGoogleTurnOrdering } from "./message-sanitization.js";

export function isGoogleModelApi(api?: string | null): boolean {
  return api === "google-gemini-cli" || api === "google-generative-ai";
}

export { sanitizeGoogleTurnOrdering };
