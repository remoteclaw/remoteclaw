/**
 * Content-based slug generator for session memory filenames.
 *
 * Extracts significant keywords from session content to produce
 * human-readable slugs (e.g., "debug-auth-flow") without requiring
 * an LLM call.
 */

const STOP_WORDS = new Set([
  "a",
  "about",
  "after",
  "all",
  "also",
  "am",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "because",
  "been",
  "before",
  "being",
  "between",
  "both",
  "but",
  "by",
  "can",
  "could",
  "did",
  "do",
  "does",
  "each",
  "every",
  "few",
  "for",
  "from",
  "further",
  "get",
  "got",
  "had",
  "has",
  "have",
  "he",
  "hello",
  "her",
  "here",
  "hey",
  "hi",
  "him",
  "his",
  "how",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "just",
  "know",
  "let",
  "like",
  "make",
  "me",
  "might",
  "more",
  "most",
  "my",
  "need",
  "no",
  "nor",
  "not",
  "of",
  "off",
  "ok",
  "okay",
  "on",
  "only",
  "or",
  "other",
  "our",
  "out",
  "over",
  "own",
  "please",
  "right",
  "same",
  "shall",
  "she",
  "should",
  "so",
  "some",
  "such",
  "sure",
  "take",
  "than",
  "thank",
  "thanks",
  "that",
  "the",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "think",
  "this",
  "those",
  "through",
  "to",
  "too",
  "try",
  "under",
  "up",
  "us",
  "very",
  "want",
  "was",
  "we",
  "well",
  "were",
  "what",
  "when",
  "where",
  "which",
  "while",
  "who",
  "whom",
  "why",
  "will",
  "with",
  "would",
  "yeah",
  "yes",
  "you",
  "your",
]);

/**
 * Generate a short slug from session content by extracting keywords.
 *
 * Focuses on user messages (which typically contain the topic), filters
 * stop words, and returns the first 2-3 unique significant words joined
 * by hyphens. Returns `null` if no meaningful words can be extracted.
 */
export function generateSlug(sessionContent: string): string | null {
  // Focus on user messages — they typically carry the topic
  const userText = sessionContent
    .split("\n")
    .filter((line) => line.startsWith("user: "))
    .map((line) => line.slice(6))
    .join(" ");

  const words = userText
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

  if (words.length === 0) {
    return null;
  }

  // Take first 2-3 unique significant words
  const seen = new Set<string>();
  const slugWords: string[] = [];
  for (const word of words) {
    if (seen.has(word)) {
      continue;
    }
    seen.add(word);
    slugWords.push(word);
    if (slugWords.length >= 3) {
      break;
    }
  }

  return slugWords.join("-");
}
