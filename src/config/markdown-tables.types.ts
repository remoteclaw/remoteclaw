import type { MarkdownTableMode } from "./types.base.js";
import type { RemoteClawConfig } from "./types.remoteclaw.js";

export type ResolveMarkdownTableModeParams = {
  cfg?: Partial<RemoteClawConfig>;
  channel?: string | null;
  accountId?: string | null;
};

export type ResolveMarkdownTableMode = (
  params: ResolveMarkdownTableModeParams,
) => MarkdownTableMode;
