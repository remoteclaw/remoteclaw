import type {
  AnyAgentTool,
  RemoteClawPluginApi,
  RemoteClawPluginToolFactory,
} from "../../src/plugins/types.js";
import { createLobsterTool } from "./src/lobster-tool.js";

export default function register(api: RemoteClawPluginApi) {
  api.registerTool(
    ((ctx) => {
      if (ctx.sandboxed) {
        return null;
      }
      return createLobsterTool(api) as AnyAgentTool;
    }) as RemoteClawPluginToolFactory,
    { optional: true },
  );
}
