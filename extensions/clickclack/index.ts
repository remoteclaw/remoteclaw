/**
 * Bundled channel entry for the ClickClack plugin.
 *
 * The fork registers bundled channel plugins through the plugin API's
 * `registerChannel` hook (see extensions/mattermost, extensions/matrix) rather
 * than upstream's `defineBundledChannelEntry` contract, which this repo's
 * plugin-sdk does not ship.
 */
import type { RemoteClawPluginApi } from "remoteclaw/plugin-sdk/clickclack";
import { emptyPluginConfigSchema } from "remoteclaw/plugin-sdk/clickclack";
import { clickClackPlugin } from "./src/channel.js";
import { setClickClackRuntime } from "./src/runtime.js";

const plugin = {
  id: "clickclack",
  name: "ClickClack",
  description: "ClickClack channel plugin",
  configSchema: emptyPluginConfigSchema(),
  register(api: RemoteClawPluginApi) {
    setClickClackRuntime(api.runtime);
    api.registerChannel({ plugin: clickClackPlugin });
  },
};

export default plugin;
