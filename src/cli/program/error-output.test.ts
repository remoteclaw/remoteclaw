import { describe, expect, it } from "vitest";
import { formatCliParseErrorOutput } from "./error-output.js";

describe("formatCliParseErrorOutput", () => {
  it("explains unknown commands with root help and plugin hints", () => {
    const output = formatCliParseErrorOutput("error: unknown command 'wat'\n", {
      argv: ["node", "remoteclaw", "wat"],
    });

    expect(output).toContain('RemoteClaw does not know the command "wat".');
    expect(output).toContain("remoteclaw --help");
    expect(output).toContain("remoteclaw plugins list");
  });

  it("points unknown options at the active command help", () => {
    const output = formatCliParseErrorOutput("error: unknown option '--wat'\n", {
      argv: ["node", "remoteclaw", "channels", "status", "--wat"],
    });

    expect(output).toContain('RemoteClaw does not recognize option "--wat".');
    expect(output).toContain("remoteclaw channels status --help");
  });

  it("points missing required arguments at command help", () => {
    const output = formatCliParseErrorOutput("error: missing required argument 'name'\n", {
      argv: ["node", "remoteclaw", "plugins", "install"],
    });

    expect(output).toContain('Missing required argument "name".');
    expect(output).toContain("remoteclaw plugins install --help");
  });
});
