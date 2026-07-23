// Matrix helper module supports format behavior.
import MarkdownIt from "markdown-it";

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  typographer: false,
});

md.enable("strikethrough");

const { escapeHtml } = md.utils;

/**
 * File extensions that share TLDs and commonly appear in code/documentation.
 * markdown-it's linkify auto-links bare tokens like `README.md` or `backup.sh`
 * into `http://README.md` / `http://backup.sh` (`.md` is Moldova, `.sh` is
 * Saint Helena), turning innocuous file references in agent output into
 * clickable external URLs. These extensions suppress that.
 *
 * Excluded: .ai, .io, .tv, .fm (popular domain TLDs like x.ai, vercel.io).
 */
const FILE_EXTENSIONS_WITH_TLD = new Set([
  "md", // Markdown (Moldova) - very common in repos
  "go", // Go language - common in Go projects
  "py", // Python (Paraguay) - common in Python projects
  "pl", // Perl (Poland) - common in Perl projects
  "sh", // Shell (Saint Helena) - common for scripts
  "am", // Automake files (Armenia)
  "at", // Assembly (Austria)
  "be", // Backend files (Belgium)
  "cc", // C++ source (Cocos Islands)
]);

/** Detects when markdown-it linkify auto-generated a link from a bare filename (e.g. README.md → http://README.md). */
function isAutoLinkedFileRef(href: string, label: string): boolean {
  const stripped = href.replace(/^https?:\/\//i, "");
  if (stripped !== label) {
    return false;
  }
  const dotIndex = label.lastIndexOf(".");
  if (dotIndex < 1) {
    return false;
  }
  const ext = label.slice(dotIndex + 1).toLowerCase();
  if (!FILE_EXTENSIONS_WITH_TLD.has(ext)) {
    return false;
  }
  // Reject if any path segment before the filename contains a dot (looks like a domain).
  const segments = label.split("/");
  for (let i = 0; i < segments.length - 1; i += 1) {
    if (segments[i].includes(".")) {
      return false;
    }
  }
  return true;
}

function shouldSuppressAutoLink(
  tokens: Parameters<NonNullable<typeof md.renderer.rules.link_open>>[0],
  idx: number,
): boolean {
  const token = tokens[idx];
  if (token?.type !== "link_open" || token.info !== "auto") {
    return false;
  }
  const href = token.attrGet("href") ?? "";
  const label = tokens[idx + 1]?.type === "text" ? (tokens[idx + 1]?.content ?? "") : "";
  return Boolean(href && label && isAutoLinkedFileRef(href, label));
}

md.renderer.rules.image = (tokens, idx) => escapeHtml(tokens[idx]?.content ?? "");

md.renderer.rules.html_block = (tokens, idx) => escapeHtml(tokens[idx]?.content ?? "");
md.renderer.rules.html_inline = (tokens, idx) => escapeHtml(tokens[idx]?.content ?? "");
md.renderer.rules.link_open = (tokens, idx, options, _env, self) =>
  shouldSuppressAutoLink(tokens, idx) ? "" : self.renderToken(tokens, idx, options);
md.renderer.rules.link_close = (tokens, idx, options, _env, self) => {
  const openIdx = idx - 2;
  if (openIdx >= 0 && shouldSuppressAutoLink(tokens, openIdx)) {
    return "";
  }
  return self.renderToken(tokens, idx, options);
};

export function markdownToMatrixHtml(markdown: string): string {
  const rendered = md.render(markdown ?? "");
  return rendered.trimEnd();
}
