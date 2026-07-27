// Matrix tests cover send formatting mention behavior.
import type { MatrixClient } from "@vector-im/matrix-bot-sdk";
import { describe, expect, it } from "vitest";
import {
  buildTextContent,
  enrichMatrixFormattedContent,
  extractMatrixMentions,
  resolveMatrixMentionsForBody,
} from "./formatting.js";
import type { MatrixFormattedContent } from "./types.js";

function createMentionClient(selfUserId = "@bot:example.org") {
  return {
    getUserId: async () => selfUserId,
  } as unknown as MatrixClient;
}

describe("buildTextContent", () => {
  it("returns a plain text body without formatting", () => {
    const content = buildTextContent("hello @alice:example.org");
    expect(content.msgtype).toBe("m.text");
    expect(content.body).toBe("hello @alice:example.org");
    expect(content.format).toBeUndefined();
    expect(content.formatted_body).toBeUndefined();
  });

  it("attaches a relation when provided", () => {
    const content = buildTextContent("hi", { "m.in_reply_to": { event_id: "$evt" } });
    expect(content["m.relates_to"]).toEqual({ "m.in_reply_to": { event_id: "$evt" } });
  });
});

describe("enrichMatrixFormattedContent", () => {
  it("adds formatted_body and m.mentions for a mention", async () => {
    const content: MatrixFormattedContent = { msgtype: "m.text", body: "hello @alice:example.org" };
    await enrichMatrixFormattedContent({
      client: createMentionClient(),
      content,
      markdown: "hello @alice:example.org",
    });

    expect(content.format).toBe("org.matrix.custom.html");
    expect(content.formatted_body).toBe(
      '<p>hello <a href="https://matrix.to/#/%40alice%3Aexample.org">@alice:example.org</a></p>',
    );
    expect(content["m.mentions"]).toEqual({ user_ids: ["@alice:example.org"] });
  });

  it("escapes raw HTML in the formatted body", async () => {
    const content: MatrixFormattedContent = { msgtype: "m.text", body: "<b>x</b>" };
    await enrichMatrixFormattedContent({
      client: createMentionClient(),
      content,
      markdown: "<b>x</b>",
    });

    expect(content.formatted_body).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(content.formatted_body).not.toContain("<b>x</b>");
  });

  it("skips mention resolution when includeMentions is false", async () => {
    const content: MatrixFormattedContent = { msgtype: "m.text", body: "hello @alice:example.org" };
    await enrichMatrixFormattedContent({
      client: createMentionClient(),
      content,
      markdown: "hello @alice:example.org",
      includeMentions: false,
    });

    expect(content.format).toBe("org.matrix.custom.html");
    expect(content.formatted_body).toBe("<p>hello @alice:example.org</p>");
    expect(content["m.mentions"]).toBeUndefined();
  });

  it("clears formatting fields when there is no markdown to render", async () => {
    const content: MatrixFormattedContent = {
      msgtype: "m.text",
      body: "photo.png",
      format: "org.matrix.custom.html",
      formatted_body: "<p>stale</p>",
      "m.mentions": { user_ids: ["@stale:example.org"] },
    };
    await enrichMatrixFormattedContent({
      client: createMentionClient(),
      content,
      markdown: "",
    });

    expect(content.format).toBeUndefined();
    expect(content.formatted_body).toBeUndefined();
    expect(content["m.mentions"]).toStrictEqual({});
  });
});

describe("resolveMatrixMentionsForBody", () => {
  it("resolves mentions from a plain body without rendering HTML", async () => {
    const mentions = await resolveMatrixMentionsForBody({
      client: createMentionClient(),
      body: "ping @alice:example.org and @room",
    });

    expect(mentions).toEqual({ user_ids: ["@alice:example.org"], room: true });
  });

  it("returns an empty object when there is nothing to mention", async () => {
    const mentions = await resolveMatrixMentionsForBody({
      client: createMentionClient(),
      body: "no mentions here",
    });

    expect(mentions).toStrictEqual({});
  });
});

describe("extractMatrixMentions", () => {
  it("returns an empty object when m.mentions is missing or not an object", () => {
    expect(extractMatrixMentions(undefined)).toStrictEqual({});
    expect(extractMatrixMentions({})).toStrictEqual({});
    expect(extractMatrixMentions({ "m.mentions": "nope" })).toStrictEqual({});
  });

  it("keeps only non-empty string user ids", () => {
    const mentions = extractMatrixMentions({
      "m.mentions": { user_ids: ["@alice:example.org", "", "   ", 42, null] },
    });

    expect(mentions).toEqual({ user_ids: ["@alice:example.org"] });
  });

  it("only treats room as true for a literal true", () => {
    expect(extractMatrixMentions({ "m.mentions": { room: true } })).toEqual({ room: true });
    expect(extractMatrixMentions({ "m.mentions": { room: "true" } })).toStrictEqual({});
  });
});
