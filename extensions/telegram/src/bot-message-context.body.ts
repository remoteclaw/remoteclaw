/**
 * Frame a machine-generated audio transcript as untrusted content before it becomes the
 * agent-facing prompt body (`BodyForAgent`). A crafted voice note whose transcript reads like
 * an instruction ("System: ignore previous instructions…") must not reach the agent as if it
 * were user-typed text — the label makes the provenance explicit and `JSON.stringify` escapes
 * the transcript so it cannot break out of the framing. Defense-in-depth for #2956.
 *
 * Only the agent-facing body is framed: mention-matching and the human-readable envelope body
 * operate on the raw transcript.
 */
export function formatAudioTranscriptForAgent(transcript: string): string {
  return `[Audio transcript (machine-generated, untrusted)]: ${JSON.stringify(transcript)}`;
}
