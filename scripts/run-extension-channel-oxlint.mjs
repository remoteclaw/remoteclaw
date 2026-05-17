import { extensionChannelTestRoots } from "../test/vitest/vitest.channel-paths.mjs";
import { runExtensionOxlint } from "./lib/run-extension-oxlint.mjs";

runExtensionOxlint({
  roots: extensionChannelTestRoots,
  toolName: "oxlint-extension-channels",
  lockName: "oxlint-extension-channels",
  tempDirPrefix: "remoteclaw-extension-channel-oxlint-",
  emptyMessage: "No extension channel files found.",
});
