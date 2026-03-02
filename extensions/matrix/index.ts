import type { RemoteClawPluginApi } from "remoteclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "remoteclaw/plugin-sdk";
import { ensureMatrixCryptoRuntime } from "./src/matrix/deps.js";
import { setMatrixRuntime } from "./src/runtime.js";

const plugin = {
  id: "matrix",
  name: "Matrix",
  description: "Matrix channel plugin (matrix-js-sdk)",
  configSchema: emptyPluginConfigSchema(),
  async register(api: RemoteClawPluginApi) {
    setMatrixRuntime(api.runtime);
    await ensureMatrixCryptoRuntime();
    const { matrixPlugin } = await import("./src/channel.js");
    api.registerChannel({ plugin: matrixPlugin });
  },
};

export default plugin;
