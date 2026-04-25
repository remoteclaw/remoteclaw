import fs from "node:fs";
import path from "node:path";

// `tsc` emits declarations under `dist/plugin-sdk/src/plugin-sdk/*` because the source
// lives at `src/plugin-sdk/*` and `rootDir` is the repo root (changed from `src/` in
// #2558 to allow channel extensions at `extensions/{channel}/src/**` to participate in
// the dts program — TS6059 fires when transitive imports cross the rootDir boundary).
//
// Our package export map points subpath `types` at `dist/plugin-sdk/<entry>.d.ts`, so we
// generate stable entry d.ts files that re-export the real declarations.
const entrypoints = [
  "index",
  "core",
  "compat",
  "telegram",
  "discord",
  "slack",
  "signal",
  "imessage",
  "whatsapp",
  "line",
  "msteams",
  "acpx",
  "bluebubbles",
  "copilot-proxy",
  "device-pair",
  "diagnostics-otel",
  "diffs",
  "feishu",
  "googlechat",
  "irc",
  "llm-task",
  "lobster",
  "matrix",
  "mattermost",
  "nextcloud-talk",
  "nostr",
  "open-prose",
  "phone-control",
  "synology-chat",
  "talk-voice",
  "test-utils",
  "thread-ownership",
  "tlon",
  "twitch",
  "voice-call",
  "zalo",
  "zalouser",
  "account-id",
  "keyed-async-queue",
] as const;
for (const entry of entrypoints) {
  const out = path.join(process.cwd(), `dist/plugin-sdk/${entry}.d.ts`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  // NodeNext: reference the runtime specifier with `.js`, TS will map it to `.d.ts`.
  fs.writeFileSync(out, `export * from "./src/plugin-sdk/${entry}.js";\n`, "utf8");
}
