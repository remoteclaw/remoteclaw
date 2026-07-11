import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readComponentsCss(): string {
  const cssPath = [
    resolve(process.cwd(), "ui/src/styles/components.css"),
    resolve(process.cwd(), "..", "ui/src/styles/components.css"),
  ].find((candidate) => existsSync(candidate));
  expect(cssPath).toBeTruthy();
  return readFileSync(cssPath!, "utf8");
}

describe("code block highlight styles", () => {
  it("targets the markdown renderer's generated code block wrapper", () => {
    const css = readComponentsCss();

    expect(css).toContain(":is(.code-block .hljs, .code-block-wrapper pre code.hljs)");
    expect(css).toContain(":is(.code-block, .code-block-wrapper pre code.hljs) .hljs-keyword");
    expect(css).toContain(
      ':root[data-theme-mode="light"] :is(.code-block, .code-block-wrapper pre code.hljs) .hljs-string',
    );
  });
});

describe("agent fallback chip styles", () => {
  it("styles the chip remove control inside the agent model input", () => {
    const css = readComponentsCss();

    expect(css).toContain(".agent-chip-input .chip {");
    expect(css).toContain(".agent-chip-input .chip-remove {");
    expect(css).toContain(".agent-chip-input .chip-remove:hover:not(:disabled)");
    expect(css).toContain(".agent-chip-input .chip-remove:focus-visible:not(:disabled)");
    expect(css).toContain("outline: 2px solid var(--accent);");
    expect(css).toContain("outline-offset: 2px;");
    expect(css).toContain(".agent-chip-input .chip-remove:disabled");
  });

  it("keeps touch-primary field controls large enough to avoid iOS focus zoom", () => {
    const css = readComponentsCss();

    expect(css).toMatch(
      /@media \(hover: none\) and \(pointer: coarse\) \{[\s\S]*\.field input,[\s\S]*\.field textarea,[\s\S]*\.field select \{[\s\S]*font-size: 16px;/,
    );
  });
});

describe("field select styles", () => {
  it("keeps light-mode native select arrows visible without tiling", () => {
    const css = readComponentsCss();

    expect(css).toMatch(
      /\.field select \{[\s\S]*background-image: url\("data:image\/svg\+xml,[^"]*stroke='%23a1a1aa'[^"]*"\);[\s\S]*background-repeat: no-repeat;[\s\S]*background-position: right 10px center;/,
    );
    expect(css).toMatch(
      /:root\[data-theme-mode="light"\] \.field input,[\s\S]*:root\[data-theme-mode="light"\] \.field textarea,[\s\S]*:root\[data-theme-mode="light"\] \.field select \{[\s\S]*background-color: var\(--card\);[\s\S]*border-color: var\(--input\);[\s\S]*\}\n\n:root\[data-theme-mode="light"\] \.field select \{[\s\S]*background-image: url\("data:image\/svg\+xml,[^"]*stroke='%23444'[^"]*"\);/,
    );
    expect(css).not.toContain(
      ':root[data-theme-mode="light"] .field select {\n  background: var(--card);',
    );
  });
});

describe("sessions filter styles", () => {
  it("keeps the expanded sessions filters on one row until the mobile breakpoint", () => {
    const css = readComponentsCss();

    expect(css).toContain(".sessions-filter-bar {\n  display: flex;\n  flex-wrap: wrap;");
    expect(css).toContain("@media (max-width: 760px)");
    expect(css).toContain(".sessions-filter-bar {\n    flex-direction: column;");
  });
});

describe("overview access grid styles", () => {
  it("keeps access fields and native controls within the card", () => {
    const css = readComponentsCss();

    expect(css).toContain(
      "grid-template-columns: repeat(auto-fit, minmax(min(200px, 100%), 1fr));",
    );
    expect(css).toContain(".ov-access-grid .field {\n  min-width: 0;");
    expect(css).toContain(".ov-access-grid .field input,\n.ov-access-grid .field select {");
    expect(css).toContain("box-sizing: border-box;");
    expect(css).toContain("width: 100%;");
  });
});
