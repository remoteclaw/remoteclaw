import path from "node:path";
import type { RemoteClawConfig } from "../config/config.js";
import { STATE_DIR } from "../config/paths.js";
import { logVerbose } from "../globals.js";
import { loadJsonFile, saveJsonFile } from "../infra/json-file.js";

const CACHE_FILE = path.join(STATE_DIR, "telegram", "sticker-cache.json");
const CACHE_VERSION = 1;

export interface CachedSticker {
  fileId: string;
  fileUniqueId: string;
  emoji?: string;
  setName?: string;
  description: string;
  cachedAt: string;
  receivedFrom?: string;
}

interface StickerCache {
  version: number;
  stickers: Record<string, CachedSticker>;
}

function loadCache(): StickerCache {
  const data = loadJsonFile(CACHE_FILE);
  if (!data || typeof data !== "object") {
    return { version: CACHE_VERSION, stickers: {} };
  }
  const cache = data as StickerCache;
  if (cache.version !== CACHE_VERSION) {
    // Future: handle migration if needed
    return { version: CACHE_VERSION, stickers: {} };
  }
  return cache;
}

function saveCache(cache: StickerCache): void {
  saveJsonFile(CACHE_FILE, cache);
}

/**
 * Get a cached sticker by its unique ID.
 */
export function getCachedSticker(fileUniqueId: string): CachedSticker | null {
  const cache = loadCache();
  return cache.stickers[fileUniqueId] ?? null;
}

/**
 * Add or update a sticker in the cache.
 */
export function cacheSticker(sticker: CachedSticker): void {
  const cache = loadCache();
  cache.stickers[sticker.fileUniqueId] = sticker;
  saveCache(cache);
}

/**
 * Search cached stickers by text query (fuzzy match on description + emoji + setName).
 */
export function searchStickers(query: string, limit = 10): CachedSticker[] {
  const cache = loadCache();
  const queryLower = query.toLowerCase();
  const results: Array<{ sticker: CachedSticker; score: number }> = [];

  for (const sticker of Object.values(cache.stickers)) {
    let score = 0;
    const descLower = sticker.description.toLowerCase();

    // Exact substring match in description
    if (descLower.includes(queryLower)) {
      score += 10;
    }

    // Word-level matching
    const queryWords = queryLower.split(/\s+/).filter(Boolean);
    const descWords = descLower.split(/\s+/);
    for (const qWord of queryWords) {
      if (descWords.some((dWord) => dWord.includes(qWord))) {
        score += 5;
      }
    }

    // Emoji match
    if (sticker.emoji && query.includes(sticker.emoji)) {
      score += 8;
    }

    // Set name match
    if (sticker.setName?.toLowerCase().includes(queryLower)) {
      score += 3;
    }

    if (score > 0) {
      results.push({ sticker, score });
    }
  }

  return results
    .toSorted((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.sticker);
}

/**
 * Get all cached stickers (for debugging/listing).
 */
export function getAllCachedStickers(): CachedSticker[] {
  const cache = loadCache();
  return Object.values(cache.stickers);
}

/**
 * Get cache statistics.
 */
export function getCacheStats(): { count: number; oldestAt?: string; newestAt?: string } {
  const cache = loadCache();
  const stickers = Object.values(cache.stickers);
  if (stickers.length === 0) {
    return { count: 0 };
  }
  const sorted = [...stickers].toSorted(
    (a, b) => new Date(a.cachedAt).getTime() - new Date(b.cachedAt).getTime(),
  );
  return {
    count: stickers.length,
    oldestAt: sorted[0]?.cachedAt,
    newestAt: sorted[sorted.length - 1]?.cachedAt,
  };
}

export interface DescribeStickerParams {
  imagePath: string;
  cfg: RemoteClawConfig;
  agentDir?: string;
  agentId?: string;
}

/**
 * Describe a sticker image using vision API.
 * Currently returns null — provider-based image description was removed
 * (the Pi-era model catalog was gutted). Will be restored when image
 * understanding routes through CLI agent multimodal capabilities.
 */
export async function describeStickerImage(_params: DescribeStickerParams): Promise<string | null> {
  logVerbose("telegram: sticker image description not available (provider-based image removed)");
  return null;
}
