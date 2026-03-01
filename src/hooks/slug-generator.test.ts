import { describe, expect, it } from "vitest";
import { generateSlug } from "./slug-generator.js";

describe("generateSlug", () => {
  it("extracts keywords from user messages", () => {
    const content = [
      "user: How do I debug the auth flow?",
      "assistant: You can use the debugger to step through the auth middleware.",
    ].join("\n");

    expect(generateSlug(content)).toBe("debug-auth-flow");
  });

  it("skips stop words", () => {
    const content = "user: What is the best way to fix this bug?";
    const slug = generateSlug(content);
    expect(slug).not.toBeNull();
    expect(slug).not.toContain("what");
    expect(slug).not.toContain("the");
    expect(slug).not.toContain("this");
  });

  it("returns null for content with only stop words", () => {
    const content = "user: Hi, how are you?";
    expect(generateSlug(content)).toBeNull();
  });

  it("returns null for empty content", () => {
    expect(generateSlug("")).toBeNull();
  });

  it("returns null for content with no user messages", () => {
    const content = "assistant: Here is some help for you.";
    expect(generateSlug(content)).toBeNull();
  });

  it("limits slug to 3 words", () => {
    const content = "user: Deploy kubernetes cluster monitoring dashboard configuration";
    const slug = generateSlug(content)!;
    expect(slug.split("-").length).toBeLessThanOrEqual(3);
  });

  it("deduplicates words", () => {
    const content = [
      "user: deploy the deploy script for deploy",
      "user: check the deploy logs",
    ].join("\n");
    const slug = generateSlug(content)!;
    // "deploy" should appear only once
    expect(slug.split("-").filter((w) => w === "deploy").length).toBe(1);
  });

  it("strips non-alphanumeric characters", () => {
    const content = "user: Fix the user's email-validation bug (#123)";
    const slug = generateSlug(content)!;
    expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("ignores assistant messages for keyword extraction", () => {
    const content = [
      "user: Hello there",
      "assistant: Let me explain the complicated authentication system",
    ].join("\n");
    // "hello" and "there" are stop words, so null
    expect(generateSlug(content)).toBeNull();
  });
});
