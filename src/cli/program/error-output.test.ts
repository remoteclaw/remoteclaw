import { describe, expect, it } from "vitest";
import { formatCliParseErrorOutput } from "./error-output.js";

describe("formatCliParseErrorOutput", () => {
  it("explains unknown commands with root help and plugin hints", () => {
    const output = formatCliParseErrorOutput("error: unknown command 'wat'\n", {
      argv: ["node", "remoteclaw", "wat"],
    });

    expect(output).toBe(
      'RemoteClaw does not know the command "wat".\nTry: remoteclaw --help\nPlugin command? remoteclaw plugins list\nDocs: https://docs.remoteclaw.org/cli\n',
    );
  });

  it("points unknown options at the active command help", () => {
    const output = formatCliParseErrorOutput("error: unknown option '--wat'\n", {
      argv: ["node", "remoteclaw", "channels", "status", "--wat"],
    });

    expect(output).toBe(
      'RemoteClaw does not recognize option "--wat".\nTry: remoteclaw channels status --help\n',
    );
  });

  it("points missing required arguments at command help", () => {
    const output = formatCliParseErrorOutput("error: missing required argument 'name'\n", {
      argv: ["node", "remoteclaw", "plugins", "install"],
    });

    expect(output).toBe(
      'Missing required argument "name".\nTry: remoteclaw plugins install --help\n',
    );
  });
});
