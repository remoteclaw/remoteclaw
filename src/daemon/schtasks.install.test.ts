// Windows schtasks install tests cover scheduled task installation behavior.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { installScheduledTask, readScheduledTaskCommand } from "./schtasks.js";

const schtasksCalls: string[][] = [];
// Captures the XML payload at `/Create /XML` time before the production code's
// `finally` block deletes the temp file, so tests can assert on battery flags.
const xmlPayloadCaptures: Array<{ index: number; xml: string }> = [];

vi.mock("./schtasks-exec.js", () => ({
  execSchtasks: async (argv: string[]) => {
    const index = schtasksCalls.length;
    schtasksCalls.push(argv);
    const xmlFlagPos = argv.indexOf("/XML");
    if (xmlFlagPos !== -1) {
      const xmlPath = argv[xmlFlagPos + 1];
      if (typeof xmlPath === "string") {
        try {
          const raw = await fs.readFile(xmlPath);
          // Strip the UTF-16 LE BOM and decode for readable assertions.
          xmlPayloadCaptures.push({ index, xml: raw.slice(2).toString("utf16le") });
        } catch {
          // Mock cannot block production cleanup; tests assert via captured payloads.
        }
      }
    }
    return { code: 0, stdout: "", stderr: "" };
  },
}));

beforeEach(() => {
  schtasksCalls.length = 0;
  xmlPayloadCaptures.length = 0;
});

describe("installScheduledTask", () => {
  async function withUserProfileDir(
    run: (tmpDir: string, env: Record<string, string>) => Promise<void>,
  ) {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "remoteclaw-schtasks-install-"));
    const env = {
      USERPROFILE: tmpDir,
      REMOTECLAW_PROFILE: "default",
    };
    try {
      await run(tmpDir, env);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  }

  it("writes quoted set assignments and escapes metacharacters", async () => {
    await withUserProfileDir(async (_tmpDir, env) => {
      const { scriptPath } = await installScheduledTask({
        env,
        stdout: new PassThrough(),
        programArguments: [
          "node",
          "gateway.js",
          "--display-name",
          "safe&whoami",
          "--percent",
          "%TEMP%",
          "--bang",
          "!token!",
        ],
        workingDirectory: "C:\\temp\\poc&calc",
        environment: {
          OC_INJECT: "safe & whoami | calc",
          OC_CARET: "a^b",
          OC_PERCENT: "%TEMP%",
          OC_BANG: "!token!",
          OC_QUOTE: 'he said "hi"',
          OC_EMPTY: "",
        },
      });

      const script = await fs.readFile(scriptPath, "utf8");
      expect(script).toContain('cd /d "C:\\temp\\poc&calc"');
      expect(script).toContain(
        'node gateway.js --display-name "safe&whoami" --percent "%%TEMP%%" --bang "^!token^!"',
      );
      expect(script).toContain('set "OC_INJECT=safe & whoami | calc"');
      expect(script).toContain('set "OC_CARET=a^^b"');
      expect(script).toContain('set "OC_PERCENT=%%TEMP%%"');
      expect(script).toContain('set "OC_BANG=^!token^!"');
      expect(script).toContain('set "OC_QUOTE=he said ^"hi^""');
      expect(script).not.toContain('set "OC_EMPTY=');
      expect(script).not.toContain("set OC_INJECT=");

      const parsed = await readScheduledTaskCommand(env);
      expect(parsed).toMatchObject({
        programArguments: [
          "node",
          "gateway.js",
          "--display-name",
          "safe&whoami",
          "--percent",
          "%TEMP%",
          "--bang",
          "!token!",
        ],
        workingDirectory: "C:\\temp\\poc&calc",
      });
      expect(parsed?.environment).toMatchObject({
        OC_INJECT: "safe & whoami | calc",
        OC_CARET: "a^b",
        OC_PERCENT: "%TEMP%",
        OC_BANG: "!token!",
        OC_QUOTE: 'he said "hi"',
      });
      expect(parsed?.environment).not.toHaveProperty("OC_EMPTY");

      expect(schtasksCalls[0]).toEqual(["/Query"]);
      expect(schtasksCalls[1]?.[0]).toBe("/Create");
      expect(schtasksCalls[2]).toEqual(["/Run", "/TN", "RemoteClaw Gateway"]);
    });
  });

  it("creates the Scheduled Task via XML with battery start/continue enabled (#59299)", async () => {
    await withUserProfileDir(async (_tmpDir, env) => {
      await installScheduledTask({
        env: {
          ...env,
          USERDOMAIN: "WORKSTATION",
          USERNAME: "alice",
        },
        stdout: new PassThrough(),
        programArguments: ["node", "gateway.js"],
        environment: {},
      });

      // `/Create` must use `/XML <path>` so battery flags can be set; the
      // CLI flag form (`/SC ONLOGON /RL LIMITED /TR ...`) cannot express
      // `DisallowStartIfOnBatteries`/`StopIfGoingOnBatteries`.
      const createCall = schtasksCalls[1];
      expect(createCall?.[0]).toBe("/Create");
      expect(createCall).toContain("/XML");

      const captured = xmlPayloadCaptures.find((entry) => entry.index === 1);
      expect(captured).toBeDefined();
      const xml = captured?.xml ?? "";
      expect(xml).toContain("<DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>");
      expect(xml).toContain("<StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>");
      // Preserve the prior CLI semantics: ONLOGON trigger, LeastPrivilege, exec action.
      expect(xml).toContain("<LogonTrigger>");
      expect(xml).toContain("<RunLevel>LeastPrivilege</RunLevel>");
      expect(xml).toContain("<UserId>WORKSTATION\\alice</UserId>");
      expect(xml).toContain("<Exec>");
    });
  });

  it("omits /RU for workgroup accounts so schtasks can use the current local user", async () => {
    await withUserProfileDir(async (_tmpDir, env) => {
      await installScheduledTask({
        env: {
          ...env,
          USERDOMAIN: "WORKGROUP",
          USERNAME: "alice",
        },
        stdout: new PassThrough(),
        programArguments: ["node", "gateway.js"],
        environment: {},
      });

      const createCall = schtasksCalls[1];
      expect(createCall?.slice(0, 5)).toEqual([
        "/Create",
        "/F",
        "/TN",
        "RemoteClaw Gateway",
        "/XML",
      ]);
      expect(createCall).not.toContain("/RU");
      const captured = xmlPayloadCaptures.find((entry) => entry.index === 1);
      expect(captured?.xml).toContain("<UserId>alice</UserId>");
    });
  });

  it("rejects line breaks in command arguments, env vars, and descriptions", async () => {
    await withUserProfileDir(async (_tmpDir, env) => {
      await expect(
        installScheduledTask({
          env,
          stdout: new PassThrough(),
          programArguments: ["node", "gateway.js", "bad\narg"],
          environment: {},
        }),
      ).rejects.toThrow(/Command argument cannot contain CR or LF/);

      await expect(
        installScheduledTask({
          env,
          stdout: new PassThrough(),
          programArguments: ["node", "gateway.js"],
          environment: { BAD: "line1\r\nline2" },
        }),
      ).rejects.toThrow(/Environment variable value cannot contain CR or LF/);

      await expect(
        installScheduledTask({
          env,
          stdout: new PassThrough(),
          description: "bad\ndescription",
          programArguments: ["node", "gateway.js"],
          environment: {},
        }),
      ).rejects.toThrow(/Task description cannot contain CR or LF/);
    });
  });

  it("does not persist a frozen PATH snapshot into the generated task script", async () => {
    await withUserProfileDir(async (_tmpDir, env) => {
      const { scriptPath } = await installScheduledTask({
        env,
        stdout: new PassThrough(),
        programArguments: ["node", "gateway.js"],
        environment: {
          PATH: "C:\\Windows\\System32;C:\\Program Files\\Docker\\Docker\\resources\\bin",
          REMOTECLAW_GATEWAY_PORT: "18789",
        },
      });

      const script = await fs.readFile(scriptPath, "utf8");
      expect(script).not.toContain('set "PATH=');
      expect(script).toContain('set "REMOTECLAW_GATEWAY_PORT=18789"');
    });
  });
});
