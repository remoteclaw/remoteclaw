import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const importEnv = {
  HOME: process.env.HOME,
  NODE_OPTIONS: process.env.NODE_OPTIONS,
  NODE_PATH: process.env.NODE_PATH,
  PATH: process.env.PATH,
  TERM: process.env.TERM,
} satisfies NodeJS.ProcessEnv;

describe("mattermost bundled api seam", () => {
  // The fork exposes the bundled Mattermost plugin value via the
  // `channel-plugin-runtime.ts` seam (there is no `channel-plugin-api.ts` /
  // `mattermostSetupPlugin` — those upstream seams were consolidated away).
  it("loads the channel plugin runtime seam in direct smoke", async () => {
    const { stdout } = await execFileAsync(
      process.execPath,
      [
        "--import",
        "tsx",
        "-e",
        'const mod = await import("./extensions/mattermost/channel-plugin-runtime.ts"); process.stdout.write(JSON.stringify({keys:Object.keys(mod).sort(), id: mod.mattermostPlugin.id}));',
      ],
      {
        cwd: repoRoot,
        env: importEnv,
        timeout: 40_000,
      },
    );

    expect(stdout).toBe('{"keys":["mattermostPlugin"],"id":"mattermost"}');
  }, 45_000);
});
