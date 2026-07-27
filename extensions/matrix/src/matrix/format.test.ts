// Matrix tests cover format plugin behavior.
import type { MatrixClient } from "@vector-im/matrix-bot-sdk";
import { describe, expect, it } from "vitest";
import { markdownToMatrixHtml, renderMarkdownToMatrixHtmlWithMentions } from "./format.js";

function createMentionClient(selfUserId = "@bot:example.org") {
  return {
    getUserId: async () => selfUserId,
  } as unknown as MatrixClient;
}

describe("markdownToMatrixHtml", () => {
  it("renders basic inline formatting", () => {
    const html = markdownToMatrixHtml("hi _there_ **boss** `code`");
    expect(html).toContain("<em>there</em>");
    expect(html).toContain("<strong>boss</strong>");
    expect(html).toContain("<code>code</code>");
  });

  it("renders links as HTML", () => {
    const html = markdownToMatrixHtml("see [docs](https://example.com)");
    expect(html).toContain('<a href="https://example.com">docs</a>');
  });

  it("does not auto-link bare file references into external urls", () => {
    const html = markdownToMatrixHtml("Check README.md and backup.sh");
    expect(html).toContain("README.md");
    expect(html).toContain("backup.sh");
    expect(html).not.toContain('href="http://README.md"');
    expect(html).not.toContain('href="http://backup.sh"');
  });

  it("keeps real domains linked even when path segments look like filenames", () => {
    const html = markdownToMatrixHtml("See https://docs.example.com/backup.sh");
    expect(html).toContain('href="https://docs.example.com/backup.sh"');
  });

  it("escapes raw HTML", () => {
    const html = markdownToMatrixHtml("<b>nope</b>");
    expect(html).toContain("&lt;b&gt;nope&lt;/b&gt;");
    expect(html).not.toContain("<b>nope</b>");
  });

  it("flattens images into alt text", () => {
    const html = markdownToMatrixHtml("![alt](https://example.com/img.png)");
    expect(html).toContain("alt");
    expect(html).not.toContain("<img");
  });

  it("preserves line breaks", () => {
    const html = markdownToMatrixHtml("line1\nline2");
    expect(html).toContain("<br");
  });
});

describe("renderMarkdownToMatrixHtmlWithMentions", () => {
  it("renders qualified Matrix user mentions as matrix.to links and m.mentions metadata", async () => {
    const result = await renderMarkdownToMatrixHtmlWithMentions({
      markdown: "hello @alice:example.org",
      client: createMentionClient(),
    });

    expect(result.html).toBe(
      '<p>hello <a href="https://matrix.to/#/%40alice%3Aexample.org">@alice:example.org</a></p>',
    );
    expect(result.mentions).toEqual({
      user_ids: ["@alice:example.org"],
    });
  });

  it("url-encodes matrix.to hrefs for valid mxids with path characters", async () => {
    const result = await renderMarkdownToMatrixHtmlWithMentions({
      markdown: "hello @foo/bar:example.org",
      client: createMentionClient(),
    });

    expect(result.html).toBe(
      '<p>hello <a href="https://matrix.to/#/%40foo%2Fbar%3Aexample.org">@foo/bar:example.org</a></p>',
    );
    expect(result.mentions).toEqual({
      user_ids: ["@foo/bar:example.org"],
    });
  });

  it("treats mxids that begin with room as user mentions", async () => {
    const result = await renderMarkdownToMatrixHtmlWithMentions({
      markdown: "hello @room:example.org",
      client: createMentionClient(),
    });

    expect(result.html).toBe(
      '<p>hello <a href="https://matrix.to/#/%40room%3Aexample.org">@room:example.org</a></p>',
    );
    expect(result.mentions).toEqual({
      user_ids: ["@room:example.org"],
    });
  });

  it("treats hyphenated room-prefixed mxids as user mentions", async () => {
    const result = await renderMarkdownToMatrixHtmlWithMentions({
      markdown: "hello @room-admin:example.org",
      client: createMentionClient(),
    });

    expect(result.html).toBe(
      '<p>hello <a href="https://matrix.to/#/%40room-admin%3Aexample.org">@room-admin:example.org</a></p>',
    );
    expect(result.mentions).toEqual({
      user_ids: ["@room-admin:example.org"],
    });
  });

  it("keeps explicit room mentions as room mentions", async () => {
    const result = await renderMarkdownToMatrixHtmlWithMentions({
      markdown: "hello @room",
      client: createMentionClient(),
    });

    expect(result.html).toBe("<p>hello @room</p>");
    expect(result.mentions).toEqual({
      room: true,
    });
  });

  it("treats sentence-ending room mentions as room mentions", async () => {
    const result = await renderMarkdownToMatrixHtmlWithMentions({
      markdown: "hello @room.",
      client: createMentionClient(),
    });

    expect(result.html).toBe("<p>hello @room.</p>");
    expect(result.mentions).toEqual({
      room: true,
    });
  });

  it("treats colon-suffixed room mentions as room mentions", async () => {
    const result = await renderMarkdownToMatrixHtmlWithMentions({
      markdown: "hello @room:",
      client: createMentionClient(),
    });

    expect(result.html).toBe("<p>hello @room:</p>");
    expect(result.mentions).toEqual({
      room: true,
    });
  });

  it("trims punctuation before storing mentioned user ids", async () => {
    const result = await renderMarkdownToMatrixHtmlWithMentions({
      markdown: "hello @alice:example.org.",
      client: createMentionClient(),
    });

    expect(result.html).toBe(
      '<p>hello <a href="https://matrix.to/#/%40alice%3Aexample.org">@alice:example.org</a>.</p>',
    );
    expect(result.mentions).toEqual({
      user_ids: ["@alice:example.org"],
    });
  });

  it("does not emit mentions for mxid-like tokens with path suffixes", async () => {
    const result = await renderMarkdownToMatrixHtmlWithMentions({
      markdown: "hello @alice:example.org/path",
      client: createMentionClient(),
    });

    expect(result.html).toBe("<p>hello @alice:example.org/path</p>");
    expect(result.mentions).toStrictEqual({});
  });

  it("does not emit mentions for filename-embedded mxids with trailing hyphens", async () => {
    const result = await renderMarkdownToMatrixHtmlWithMentions({
      markdown: "read matrix-progress-@room-@alice:matrix-qa.test-!room:matrix-qa.test.txt",
      client: createMentionClient(),
    });

    expect(result.html).toBe(
      "<p>read matrix-progress-@room-@alice:matrix-qa.test-!room:matrix-qa.test.txt</p>",
    );
    expect(result.mentions).toStrictEqual({});
  });

  it("accepts bracketed homeservers in matrix mentions", async () => {
    const result = await renderMarkdownToMatrixHtmlWithMentions({
      markdown: "hello @alice:[2001:db8::1]",
      client: createMentionClient(),
    });

    expect(result.html).toBe(
      '<p>hello <a href="https://matrix.to/#/%40alice%3A%5B2001%3Adb8%3A%3A1%5D">@alice:[2001:db8::1]</a></p>',
    );
    expect(result.mentions).toEqual({
      user_ids: ["@alice:[2001:db8::1]"],
    });
  });

  it("accepts bracketed homeservers with ports in matrix mentions", async () => {
    const result = await renderMarkdownToMatrixHtmlWithMentions({
      markdown: "hello @alice:[2001:db8::1]:8448.",
      client: createMentionClient(),
    });

    expect(result.html).toBe(
      '<p>hello <a href="https://matrix.to/#/%40alice%3A%5B2001%3Adb8%3A%3A1%5D%3A8448">@alice:[2001:db8::1]:8448</a>.</p>',
    );
    expect(result.mentions).toEqual({
      user_ids: ["@alice:[2001:db8::1]:8448"],
    });
  });

  it("leaves bare localpart text unmentioned", async () => {
    const result = await renderMarkdownToMatrixHtmlWithMentions({
      markdown: "hello @alice",
      client: createMentionClient(),
    });

    expect(result.html).toBe("<p>hello @alice</p>");
    expect(result.mentions).toStrictEqual({});
  });

  it("does not mention the sending account itself", async () => {
    const result = await renderMarkdownToMatrixHtmlWithMentions({
      markdown: "hello @bot:example.org",
      client: createMentionClient("@bot:example.org"),
    });

    expect(result.html).toBe("<p>hello @bot:example.org</p>");
    expect(result.mentions).toStrictEqual({});
  });

  it("deduplicates repeated mentions of the same user", async () => {
    const result = await renderMarkdownToMatrixHtmlWithMentions({
      markdown: "@alice:example.org and @alice:example.org again",
      client: createMentionClient(),
    });

    expect(result.mentions).toEqual({
      user_ids: ["@alice:example.org"],
    });
  });

  it("renders mentions inside list items", async () => {
    const result = await renderMarkdownToMatrixHtmlWithMentions({
      markdown: "1. hello @alice:example.org\n\n2. bye",
      client: createMentionClient(),
    });

    expect(result.html).toContain(
      '<a href="https://matrix.to/#/%40alice%3Aexample.org">@alice:example.org</a>',
    );
    expect(result.mentions).toEqual({ user_ids: ["@alice:example.org"] });
  });

  it("still escapes raw HTML while resolving mentions", async () => {
    const result = await renderMarkdownToMatrixHtmlWithMentions({
      markdown: "<img src=x onerror=alert(1)> @alice:example.org",
      client: createMentionClient(),
    });

    expect(result.html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(result.html).not.toContain("<img");
    expect(result.mentions).toEqual({ user_ids: ["@alice:example.org"] });
  });

  it("does not convert escaped qualified mentions", async () => {
    const result = await renderMarkdownToMatrixHtmlWithMentions({
      markdown: "\\@alice:example.org",
      client: createMentionClient(),
    });

    expect(result.html).toBe("<p>@alice:example.org</p>");
    expect(result.mentions).toStrictEqual({});
  });

  it("does not convert escaped room mentions", async () => {
    const result = await renderMarkdownToMatrixHtmlWithMentions({
      markdown: "\\@room",
      client: createMentionClient(),
    });

    expect(result.html).toBe("<p>@room</p>");
    expect(result.mentions).toStrictEqual({});
  });

  it("keeps escaped mentions literal after escaped backticks", async () => {
    const result = await renderMarkdownToMatrixHtmlWithMentions({
      markdown: "\\`literal then \\@alice:example.org",
      client: createMentionClient(),
    });

    expect(result.html).toBe("<p>`literal then @alice:example.org</p>");
    expect(result.mentions).toStrictEqual({});
  });

  it("restores escaped mentions in markdown link labels without linking them", async () => {
    const result = await renderMarkdownToMatrixHtmlWithMentions({
      markdown: "[\\@alice:example.org](https://example.com)",
      client: createMentionClient(),
    });

    expect(result.html).toBe('<p><a href="https://example.com">@alice:example.org</a></p>');
    expect(result.mentions).toStrictEqual({});
  });

  it("keeps backslashes inside code spans", async () => {
    const result = await renderMarkdownToMatrixHtmlWithMentions({
      markdown: "`\\@alice:example.org`",
      client: createMentionClient(),
    });

    expect(result.html).toBe("<p><code>\\@alice:example.org</code></p>");
    expect(result.mentions).toStrictEqual({});
  });

  it("does not convert mentions inside code spans", async () => {
    const result = await renderMarkdownToMatrixHtmlWithMentions({
      markdown: "`@alice:example.org`",
      client: createMentionClient(),
    });

    expect(result.html).toBe("<p><code>@alice:example.org</code></p>");
    expect(result.mentions).toStrictEqual({});
  });

  it("keeps backslashes inside tilde fenced code blocks", async () => {
    const result = await renderMarkdownToMatrixHtmlWithMentions({
      markdown: "~~~\n\\@alice:example.org\n~~~",
      client: createMentionClient(),
    });

    expect(result.html).toBe("<pre><code>\\@alice:example.org\n</code></pre>");
    expect(result.mentions).toStrictEqual({});
  });

  it("keeps backslashes inside indented code blocks", async () => {
    const result = await renderMarkdownToMatrixHtmlWithMentions({
      markdown: "    \\@alice:example.org",
      client: createMentionClient(),
    });

    expect(result.html).toBe("<pre><code>\\@alice:example.org\n</code></pre>");
    expect(result.mentions).toStrictEqual({});
  });

  it("does not resolve a self id when the client cannot report one", async () => {
    const result = await renderMarkdownToMatrixHtmlWithMentions({
      markdown: "hello @alice:example.org",
      client: {} as unknown as MatrixClient,
    });

    expect(result.html).toBe(
      '<p>hello <a href="https://matrix.to/#/%40alice%3Aexample.org">@alice:example.org</a></p>',
    );
    expect(result.mentions).toEqual({ user_ids: ["@alice:example.org"] });
  });
});
