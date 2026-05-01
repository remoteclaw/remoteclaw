/* eslint-disable @typescript-eslint/no-explicit-any */
import { resolvePathFromInput } from "../../agents/path-policy.js";
import { assertMediaNotDataUrl, resolveSandboxedMediaSource } from "../../agents/sandbox-paths.js";
import type { RemoteClawConfig } from "../../config/config.js";
import type { ReplyPayload } from "../types.js";

const HTTP_URL_RE = /^https?:\/\//i;
const FILE_URL_RE = /^file:\/\//i;
const WINDOWS_DRIVE_RE = /^[a-zA-Z]:[/]/;
const SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const HAS_FILE_EXT_RE = /\.\w{1,10}$/;

function isLikelyLocalMediaSource(media: string): boolean {
  return (
    FILE_URL_RE.test(media) ||
    media.startsWith("/") ||
    media.startsWith("./") ||
    media.startsWith("../") ||
    media.startsWith("~") ||
    WINDOWS_DRIVE_RE.test(media) ||
    media.startsWith("\\") ||
    (!SCHEME_RE.test(media) &&
      (media.includes("/") || media.includes("\\") || HAS_FILE_EXT_RE.test(media)))
  );
}

function getPayloadMediaList(payload: ReplyPayload): string[] {
  return payload.mediaUrls?.length ? payload.mediaUrls : payload.mediaUrl ? [payload.mediaUrl] : [];
}

export function createReplyMediaPathNormalizer(params: {
  cfg: RemoteClawConfig;
  sessionKey?: string;
  workspaceDir: string;
}): (payload: ReplyPayload) => Promise<ReplyPayload> {
  const resolveSandboxRoot = async (): Promise<string | undefined> => {
    return undefined;
  };

  const normalizeMediaSource = async (raw: string): Promise<string> => {
    const media = raw.trim();
    if (!media) {
      return media;
    }
    assertMediaNotDataUrl(media);
    if (HTTP_URL_RE.test(media)) {
      return media;
    }
    const sandboxRoot = await resolveSandboxRoot();
    if (sandboxRoot) {
      return await (resolveSandboxedMediaSource as any)({
        media,
        sandboxRoot,
      });
    }
    if (!isLikelyLocalMediaSource(media)) {
      return media;
    }
    if (FILE_URL_RE.test(media)) {
      return media;
    }
    return resolvePathFromInput(media, params.workspaceDir);
  };

  return async (payload) => {
    const mediaList = getPayloadMediaList(payload);
    if (mediaList.length === 0) {
      return payload;
    }

    const normalizedMedia: string[] = [];
    const seen = new Set<string>();
    for (const media of mediaList) {
      const normalized = await normalizeMediaSource(media);
      if (!normalized || seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      normalizedMedia.push(normalized);
    }

    if (normalizedMedia.length === 0) {
      return {
        ...payload,
        mediaUrl: undefined,
        mediaUrls: undefined,
      };
    }

    return {
      ...payload,
      mediaUrl: normalizedMedia[0],
      mediaUrls: normalizedMedia,
    };
  };
}
