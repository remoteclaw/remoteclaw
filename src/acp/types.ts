export type { AcpProvenanceMode, AcpServerOptions, AcpSession } from "@remoteclaw/acp-core/types";
export { normalizeAcpProvenanceMode } from "@remoteclaw/acp-core/types";
import { VERSION } from "../version.js";

export const ACP_AGENT_INFO = {
  name: "remoteclaw-acp",
  title: "RemoteClaw ACP Gateway",
  version: VERSION,
};
