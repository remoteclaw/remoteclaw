import fs from "node:fs";
import path from "node:path";
import {
  listAgentIds,
  resolveAgentWorkspaceDir,
  resolveDefaultAgentId,
  resolveSessionKeyAgentId,
  resolveSoleAgentId,
} from "../agents/agent-scope.js";
import { lookupContextTokens } from "../agents/context.js";
import { DEFAULT_CONTEXT_TOKENS, DEFAULT_MODEL, DEFAULT_PROVIDER } from "../agents/defaults.js";
import {
  parseModelRef,
  resolveConfiguredModelRef,
  resolveDefaultModelForAgent,
} from "../agents/provider-utils.js";
import { type RemoteClawConfig, loadConfig } from "../config/config.js";
import { resolveStateDir } from "../config/paths.js";
import {
  buildGroupDisplayName,
  canonicalizeMainSessionAlias,
  loadSessionStore,
  resolveAgentMainSessionKey,
  resolveFreshSessionTotalTokens,
  resolveMainSessionKey,
  resolveStorePath,
  type SessionEntry,
  type SessionScope,
} from "../config/sessions.js";
import {
  resolveAllAgentSessionStoreTargetsSync,
  type SessionStoreTarget,
} from "../config/sessions/targets.js";
import { openBoundaryFileSync } from "../infra/boundary-file-read.js";
import {
  normalizeAgentId,
  normalizeMainKey,
  parseAgentSessionKey,
} from "../routing/session-key.js";
import { isCronRunSessionKey } from "../sessions/session-key-utils.js";
import {
  AVATAR_MAX_BYTES,
  isAvatarDataUrl,
  isAvatarHttpUrl,
  isPathWithinRoot,
  isWorkspaceRelativeAvatarPath,
  resolveAvatarMime,
} from "../shared/avatar-policy.js";
import { normalizeSessionDeliveryFields } from "../utils/delivery-context.js";
import { readSessionTitleFieldsFromTranscript } from "./session-utils.fs.js";
import type {
  GatewayAgentRow,
  GatewaySessionRow,
  GatewaySessionsDefaults,
  SessionsListResult,
} from "./session-utils.types.js";

export {
  archiveFileOnDisk,
  archiveSessionTranscripts,
  capArrayByJsonBytes,
  readFirstUserMessageFromTranscript,
  readLastMessagePreviewFromTranscript,
  readSessionTitleFieldsFromTranscript,
  readSessionPreviewItemsFromTranscript,
  readSessionMessages,
  resolveSessionTranscriptCandidates,
} from "./session-utils.fs.js";
export type {
  GatewayAgentRow,
  GatewaySessionRow,
  GatewaySessionsDefaults,
  SessionsListResult,
  SessionsPatchResult,
  SessionsPreviewEntry,
  SessionsPreviewResult,
} from "./session-utils.types.js";

const DERIVED_TITLE_MAX_LEN = 60;

function tryResolveExistingPath(value: string): string | null {
  try {
    return fs.realpathSync(value);
  } catch {
    return null;
  }
}

function resolveIdentityAvatarUrl(
  cfg: RemoteClawConfig,
  agentId: string,
  avatar: string | undefined,
): string | undefined {
  if (!avatar) {
    return undefined;
  }
  const trimmed = avatar.trim();
  if (!trimmed) {
    return undefined;
  }
  if (isAvatarDataUrl(trimmed) || isAvatarHttpUrl(trimmed)) {
    return trimmed;
  }
  if (!isWorkspaceRelativeAvatarPath(trimmed)) {
    return undefined;
  }
  const workspaceDir = resolveAgentWorkspaceDir(cfg, agentId);
  const workspaceRoot = tryResolveExistingPath(workspaceDir) ?? path.resolve(workspaceDir);
  const resolvedCandidate = path.resolve(workspaceRoot, trimmed);
  if (!isPathWithinRoot(workspaceRoot, resolvedCandidate)) {
    return undefined;
  }
  try {
    const opened = openBoundaryFileSync({
      absolutePath: resolvedCandidate,
      rootPath: workspaceRoot,
      rootRealPath: workspaceRoot,
      boundaryLabel: "workspace root",
      maxBytes: AVATAR_MAX_BYTES,
      skipLexicalRootCheck: true,
    });
    if (!opened.ok) {
      return undefined;
    }
    try {
      const buffer = fs.readFileSync(opened.fd);
      const mime = resolveAvatarMime(resolvedCandidate);
      return `data:${mime};base64,${buffer.toString("base64")}`;
    } finally {
      fs.closeSync(opened.fd);
    }
  } catch {
    return undefined;
  }
}

function formatSessionIdPrefix(sessionId: string, updatedAt?: number | null): string {
  const prefix = sessionId.slice(0, 8);
  if (updatedAt && updatedAt > 0) {
    const d = new Date(updatedAt);
    const date = d.toISOString().slice(0, 10);
    return `${prefix} (${date})`;
  }
  return prefix;
}

function truncateTitle(text: string, maxLen: number): string {
  if (text.length <= maxLen) {
    return text;
  }
  const cut = text.slice(0, maxLen - 1);
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > maxLen * 0.6) {
    return cut.slice(0, lastSpace) + "…";
  }
  return cut + "…";
}

export function deriveSessionTitle(
  entry: SessionEntry | undefined,
  firstUserMessage?: string | null,
): string | undefined {
  if (!entry) {
    return undefined;
  }

  if (entry.displayName?.trim()) {
    return entry.displayName.trim();
  }

  if (entry.subject?.trim()) {
    return entry.subject.trim();
  }

  if (firstUserMessage?.trim()) {
    const normalized = firstUserMessage.replace(/\s+/g, " ").trim();
    return truncateTitle(normalized, DERIVED_TITLE_MAX_LEN);
  }

  if (entry.sessionId) {
    return formatSessionIdPrefix(entry.sessionId, entry.updatedAt);
  }

  return undefined;
}

export function loadSessionEntry(sessionKey: string) {
  const cfg = loadConfig();
  const canonicalKey = resolveSessionStoreKey({ cfg, sessionKey });
  const agentId = resolveSessionStoreAgentId(cfg, canonicalKey);
  const { storePath, store } = resolveGatewaySessionStoreLookup({
    cfg,
    key: sessionKey.trim(),
    canonicalKey,
    agentId,
  });
  const target = resolveGatewaySessionStoreTarget({
    cfg,
    key: sessionKey.trim(),
    store,
  });
  const freshestMatch = resolveFreshestSessionStoreMatchFromStoreKeys(store, target.storeKeys);
  const legacyKey = freshestMatch?.key !== canonicalKey ? freshestMatch?.key : undefined;
  return { cfg, storePath, store, entry: freshestMatch?.entry, canonicalKey, legacyKey };
}

export function resolveFreshestSessionStoreMatchFromStoreKeys(
  store: Record<string, SessionEntry>,
  storeKeys: string[],
): { key: string; entry: SessionEntry } | undefined {
  const matches = storeKeys
    .map((key) => {
      const entry = store[key];
      return entry ? { key, entry } : undefined;
    })
    .filter((match): match is { key: string; entry: SessionEntry } => match !== undefined);
  if (matches.length === 0) {
    return undefined;
  }
  if (matches.length === 1) {
    return matches[0];
  }
  return [...matches].toSorted((a, b) => (b.entry.updatedAt ?? 0) - (a.entry.updatedAt ?? 0))[0];
}

/**
 * Returns the agent id encoded in a session key when that agent no longer
 * exists in configuration, or null when the key is agentless or the agent is
 * still configured. Used to reject sends/steers that target sessions whose
 * owning agent was deleted (#65524).
 */
export function resolveDeletedAgentIdFromSessionKey(
  cfg: RemoteClawConfig,
  sessionKey: string,
): string | null {
  const parsed = parseAgentSessionKey(sessionKey);
  if (!parsed) {
    return null;
  }
  const agentId = normalizeAgentId(parsed.agentId);
  if (listAgentIds(cfg).includes(agentId)) {
    return null;
  }
  return agentId;
}

/**
 * The historical OpenClaw default-agent id. Legacy single-store deployments
 * serialized the default agent's main session under `agent:main:main`. After a
 * rebrand/rename the configured default agent is no longer `main`, so that
 * on-disk entry now encodes a "deleted" agent. See sessions-resolve.ts ADR-NOTE.
 */
const LEGACY_DEFAULT_AGENT_ID = "main";

/**
 * True when sessions are backed by a single configured non-template store
 * (`cfg.session.store` is set and is NOT an `{agentId}` template). This is the
 * provenance signal that gates the legacy main-alias remap on the explicit-key
 * lookup path, and it mirrors the single-store branch of
 * `loadCombinedSessionStoreForGateway` (which surfaces the same signal as
 * `fromSingleStore` for the sessionId/label paths). One predicate, no drift.
 */
export function isSingleConfiguredSessionStore(cfg: RemoteClawConfig): boolean {
  const storeConfig = cfg.session?.store;
  return Boolean(storeConfig) && !isStorePathTemplate(storeConfig);
}

/**
 * Narrow remap of the legacy default-agent main-session alias `agent:main:main`
 * onto the live default agent's main session, restoring continuity for an old
 * default-agent "main" thread after the default agent was renamed (or the
 * no-config default became `default`). Returns the remapped session key when
 * ALL FOUR conjuncts hold, or null to leave the caller's reject/pass behavior
 * unchanged.
 *
 * Conjuncts (full rationale + fork provenance: sessions-resolve.ts ADR-NOTE):
 *   1. The encoded agent-id segment is the literal historical default-agent id
 *      `main`, AND the key is the main-SESSION alias (`agent:main:main`). A
 *      concrete non-alias session under the deleted `main` agent
 *      (e.g. `agent:main:guildchat:direct:u1`) is NOT remapped — it stays
 *      rejected.
 *   2. `main` is NOT a currently-configured agent. If a live `main` agent
 *      exists, `resolveDeletedAgentIdFromSessionKey` already returns null and
 *      the key resolves normally, so no remap is needed.
 *   3. A live DEFAULT agent exists: `resolveDefaultAgentId` resolves to a
 *      CONFIGURED agent, not the no-config `DEFAULT_AGENT_ID` ("default")
 *      fallback.
 *   4. LEGACY SINGLE-STORE PROVENANCE: the matched entry came from the single
 *      configured (non-template) store (`fromSingleStore`), NOT a discovered
 *      per-agent store. LOAD-BEARING — a discovered per-agent deleted-agent
 *      store MUST stay rejected to preserve the #65524 deleted-agent
 *      send/steer guard; ignoring provenance would re-open that hole.
 */
export function resolveLegacyDefaultMainRemap(
  cfg: RemoteClawConfig,
  key: string,
  fromSingleStore: boolean,
): string | null {
  // Conjunct 4 — provenance. Only the single configured store may remap;
  // discovered per-agent stores never do.
  if (!fromSingleStore) {
    return null;
  }
  const parsed = parseAgentSessionKey(key);
  if (!parsed) {
    return null;
  }
  // Conjunct 1a — the encoded agent-id is the historical default-agent id.
  if (normalizeAgentId(parsed.agentId) !== LEGACY_DEFAULT_AGENT_ID) {
    return null;
  }
  // Conjunct 1b — restrict to the legacy main-SESSION alias (`agent:main:main`);
  // concrete sessions under the deleted `main` agent stay rejected.
  const legacyMainAliasKey = resolveAgentMainSessionKey({
    cfg,
    agentId: LEGACY_DEFAULT_AGENT_ID,
  });
  const canonicalUnderLegacyMain = canonicalizeMainSessionAlias({
    cfg,
    agentId: LEGACY_DEFAULT_AGENT_ID,
    sessionKey: key,
  });
  if (canonicalUnderLegacyMain !== legacyMainAliasKey) {
    return null;
  }
  // Conjunct 2 — `main` is not a live, configured agent.
  if (listAgentIds(cfg).includes(LEGACY_DEFAULT_AGENT_ID)) {
    return null;
  }
  // Conjunct 3 — a configured live default agent exists (not the no-config
  // "default" fallback).
  const liveDefaultAgentId = resolveDefaultAgentId(cfg);
  if (!listAgentIds(cfg).includes(liveDefaultAgentId)) {
    return null;
  }
  // Remap agent:main:<rest> -> agent:<live-default>:<rest>, then re-canonicalize
  // the remainder so the returned key matches how the live default agent's main
  // session is stored.
  return canonicalizeMainSessionAlias({
    cfg,
    agentId: liveDefaultAgentId,
    sessionKey: `agent:${liveDefaultAgentId}:${parsed.rest}`,
  });
}

/**
 * Find the freshest session entry across exact and case-insensitive key matches.
 * Returns the entry with the newest updatedAt and the actual store key it was found
 * under, so callers can clean up legacy mixed-case keys when they differ from
 * canonicalKey. Mirrors the combined-store merge so follow-up mutations target the
 * winning row when case-variant duplicates exist.
 */
function findFreshestStoreMatch(
  store: Record<string, SessionEntry>,
  ...candidates: string[]
): { entry: SessionEntry; key: string } | undefined {
  const matches = new Map<string, { entry: SessionEntry; key: string }>();
  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    if (!trimmed) {
      continue;
    }
    const exact = store[trimmed];
    if (exact) {
      matches.set(trimmed, { entry: exact, key: trimmed });
    }
    for (const key of findStoreKeysIgnoreCase(store, trimmed)) {
      const entry = store[key];
      if (entry) {
        matches.set(key, { entry, key });
      }
    }
  }
  if (matches.size === 0) {
    return undefined;
  }
  return [...matches.values()].toSorted(
    (a, b) => (b.entry.updatedAt ?? 0) - (a.entry.updatedAt ?? 0),
  )[0];
}

/**
 * Find all on-disk store keys that match the given key case-insensitively.
 * Returns every key from the store whose lowercased form equals the target's lowercased form.
 */
export function findStoreKeysIgnoreCase(
  store: Record<string, unknown>,
  targetKey: string,
): string[] {
  const lowered = targetKey.toLowerCase();
  const matches: string[] = [];
  for (const key of Object.keys(store)) {
    if (key.toLowerCase() === lowered) {
      matches.push(key);
    }
  }
  return matches;
}

/**
 * Remove legacy key variants for one canonical session key.
 * Candidates can include aliases (for example, "agent:ops:main" when canonical is "agent:ops:work").
 */
export function pruneLegacyStoreKeys(params: {
  store: Record<string, unknown>;
  canonicalKey: string;
  candidates: Iterable<string>;
}) {
  const keysToDelete = new Set<string>();
  for (const candidate of params.candidates) {
    const trimmed = String(candidate ?? "").trim();
    if (!trimmed) {
      continue;
    }
    if (trimmed !== params.canonicalKey) {
      keysToDelete.add(trimmed);
    }
    for (const match of findStoreKeysIgnoreCase(params.store, trimmed)) {
      if (match !== params.canonicalKey) {
        keysToDelete.add(match);
      }
    }
  }
  for (const key of keysToDelete) {
    delete params.store[key];
  }
}

export function classifySessionKey(key: string, entry?: SessionEntry): GatewaySessionRow["kind"] {
  if (key === "global") {
    return "global";
  }
  if (key === "unknown") {
    return "unknown";
  }
  if (entry?.chatType === "group" || entry?.chatType === "channel") {
    return "group";
  }
  if (key.includes(":group:") || key.includes(":channel:")) {
    return "group";
  }
  return "direct";
}

export function parseGroupKey(
  key: string,
): { channel?: string; kind?: "group" | "channel"; id?: string } | null {
  const agentParsed = parseAgentSessionKey(key);
  const rawKey = agentParsed?.rest ?? key;
  const parts = rawKey.split(":").filter(Boolean);
  if (parts.length >= 3) {
    const [channel, kind, ...rest] = parts;
    if (kind === "group" || kind === "channel") {
      const id = rest.join(":");
      return { channel, kind, id };
    }
  }
  return null;
}

function isStorePathTemplate(store?: string): boolean {
  return typeof store === "string" && store.includes("{agentId}");
}

function listExistingAgentIdsFromDisk(): string[] {
  const root = resolveStateDir();
  const agentsDir = path.join(root, "agents");
  try {
    const entries = fs.readdirSync(agentsDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => normalizeAgentId(entry.name))
      .filter(Boolean);
  } catch {
    return [];
  }
}

function listConfiguredAgentIds(cfg: RemoteClawConfig): string[] {
  const ids = new Set<string>();
  const defaultId = resolveSoleAgentId(cfg) ?? listAgentIds(cfg)[0];
  if (defaultId) {
    ids.add(defaultId);
  }

  for (const entry of cfg.agents?.list ?? []) {
    if (entry?.id) {
      ids.add(normalizeAgentId(entry.id));
    }
  }

  for (const id of listExistingAgentIdsFromDisk()) {
    ids.add(id);
  }

  const sorted = Array.from(ids).filter(Boolean);
  sorted.sort((a, b) => a.localeCompare(b));
  if (defaultId && sorted.includes(defaultId)) {
    return [defaultId, ...sorted.filter((id) => id !== defaultId)];
  }
  return sorted;
}

export function listAgentsForGateway(cfg: RemoteClawConfig): {
  defaultId: string;
  mainKey: string;
  scope: SessionScope;
  agents: GatewayAgentRow[];
} {
  const defaultId = resolveSoleAgentId(cfg) ?? listAgentIds(cfg)[0];
  const mainKey = normalizeMainKey(cfg.session?.mainKey);
  const scope = cfg.session?.scope ?? "per-sender";
  const configuredById = new Map<
    string,
    { name?: string; identity?: GatewayAgentRow["identity"] }
  >();
  for (const entry of cfg.agents?.list ?? []) {
    if (!entry?.id) {
      continue;
    }
    const identity = entry.identity
      ? {
          name: entry.identity.name?.trim() || undefined,
          theme: entry.identity.theme?.trim() || undefined,
          emoji: entry.identity.emoji?.trim() || undefined,
          avatar: entry.identity.avatar?.trim() || undefined,
          avatarUrl: resolveIdentityAvatarUrl(
            cfg,
            normalizeAgentId(entry.id),
            entry.identity.avatar?.trim(),
          ),
        }
      : undefined;
    configuredById.set(normalizeAgentId(entry.id), {
      name: typeof entry.name === "string" && entry.name.trim() ? entry.name.trim() : undefined,
      identity,
    });
  }
  const explicitIds = new Set(
    (cfg.agents?.list ?? [])
      .map((entry) => (entry?.id ? normalizeAgentId(entry.id) : ""))
      .filter(Boolean),
  );
  const allowedIds = explicitIds.size > 0 ? new Set([...explicitIds, defaultId]) : null;
  let agentIds = listConfiguredAgentIds(cfg).filter((id) =>
    allowedIds ? allowedIds.has(id) : true,
  );
  if (mainKey && !agentIds.includes(mainKey) && (!allowedIds || allowedIds.has(mainKey))) {
    agentIds = [...agentIds, mainKey];
  }
  const agents = agentIds.map((id) => {
    const meta = configuredById.get(id);
    return {
      id,
      name: meta?.name,
      identity: meta?.identity,
    };
  });
  return { defaultId, mainKey, scope, agents };
}

function canonicalizeSessionKeyForAgent(agentId: string, key: string): string {
  const lowered = key.toLowerCase();
  if (lowered === "global" || lowered === "unknown") {
    return lowered;
  }
  if (lowered.startsWith("agent:")) {
    return lowered;
  }
  return `agent:${normalizeAgentId(agentId)}:${lowered}`;
}

function resolveDefaultStoreAgentId(cfg: RemoteClawConfig): string {
  return resolveSoleAgentId(cfg) ?? listAgentIds(cfg)[0];
}

export function resolveSessionStoreKey(params: {
  cfg: RemoteClawConfig;
  sessionKey: string;
}): string {
  const raw = (params.sessionKey ?? "").trim();
  if (!raw) {
    return raw;
  }
  const rawLower = raw.toLowerCase();
  if (rawLower === "global" || rawLower === "unknown") {
    return rawLower;
  }

  const parsed = parseAgentSessionKey(raw);
  if (parsed) {
    const agentId = normalizeAgentId(parsed.agentId);
    const lowered = raw.toLowerCase();
    const canonical = canonicalizeMainSessionAlias({
      cfg: params.cfg,
      agentId,
      sessionKey: lowered,
    });
    if (canonical !== lowered) {
      return canonical;
    }
    return lowered;
  }

  const lowered = raw.toLowerCase();
  const rawMainKey = normalizeMainKey(params.cfg.session?.mainKey);
  if (lowered === "main" || lowered === rawMainKey) {
    return resolveMainSessionKey(params.cfg);
  }
  const agentId = resolveDefaultStoreAgentId(params.cfg);
  return canonicalizeSessionKeyForAgent(agentId, lowered);
}

function resolveSessionStoreAgentId(cfg: RemoteClawConfig, canonicalKey: string): string {
  if (canonicalKey === "global" || canonicalKey === "unknown") {
    return resolveDefaultStoreAgentId(cfg);
  }
  const parsed = parseAgentSessionKey(canonicalKey);
  if (parsed?.agentId) {
    return normalizeAgentId(parsed.agentId);
  }
  return resolveDefaultStoreAgentId(cfg);
}

export function canonicalizeSpawnedByForAgent(
  cfg: RemoteClawConfig,
  agentId: string,
  spawnedBy?: string,
): string | undefined {
  const raw = spawnedBy?.trim();
  if (!raw) {
    return undefined;
  }
  const lower = raw.toLowerCase();
  if (lower === "global" || lower === "unknown") {
    return lower;
  }
  let result: string;
  if (raw.toLowerCase().startsWith("agent:")) {
    result = raw.toLowerCase();
  } else {
    result = `agent:${normalizeAgentId(agentId)}:${lower}`;
  }
  // Resolve main-alias references (e.g. agent:ops:main → configured main key).
  const parsed = parseAgentSessionKey(result);
  const resolvedAgent = parsed?.agentId ? normalizeAgentId(parsed.agentId) : agentId;
  return canonicalizeMainSessionAlias({ cfg, agentId: resolvedAgent, sessionKey: result });
}

function buildGatewaySessionStoreScanTargets(params: {
  cfg: RemoteClawConfig;
  key: string;
  canonicalKey: string;
  agentId: string;
}): string[] {
  const targets = new Set<string>();
  if (params.canonicalKey) {
    targets.add(params.canonicalKey);
  }
  if (params.key && params.key !== params.canonicalKey) {
    targets.add(params.key);
  }
  if (params.canonicalKey === "global" || params.canonicalKey === "unknown") {
    return [...targets];
  }
  // Include the main alias key so we catch legacy entries stored under
  // "agent:{id}:main" when mainKey != "main".
  const agentMainKey = resolveAgentMainSessionKey({ cfg: params.cfg, agentId: params.agentId });
  if (params.canonicalKey === agentMainKey) {
    targets.add(`agent:${params.agentId}:main`);
  }
  return [...targets];
}

function resolveGatewaySessionStoreCandidates(
  cfg: RemoteClawConfig,
  agentId: string,
): SessionStoreTarget[] {
  const storeConfig = cfg.session?.store;
  const defaultTarget = {
    agentId,
    storePath: resolveStorePath(storeConfig, { agentId }),
  };
  if (!isStorePathTemplate(storeConfig)) {
    return [defaultTarget];
  }
  const targets = new Map<string, SessionStoreTarget>();
  targets.set(defaultTarget.storePath, defaultTarget);
  // Include retired/manual agent stores discovered on disk so follow-up mutations
  // can find an entry whose backing directory no longer round-trips through
  // normalizeAgentId() (e.g. "Retired Agent").
  for (const target of resolveAllAgentSessionStoreTargetsSync(cfg)) {
    if (target.agentId === agentId) {
      targets.set(target.storePath, target);
    }
  }
  return [...targets.values()];
}

function resolveGatewaySessionStoreLookup(params: {
  cfg: RemoteClawConfig;
  key: string;
  canonicalKey: string;
  agentId: string;
  initialStore?: Record<string, SessionEntry>;
}): {
  storePath: string;
  store: Record<string, SessionEntry>;
  match: { entry: SessionEntry; key: string } | undefined;
} {
  const scanTargets = buildGatewaySessionStoreScanTargets(params);
  const candidates = resolveGatewaySessionStoreCandidates(params.cfg, params.agentId);
  const fallback = candidates[0] ?? {
    agentId: params.agentId,
    storePath: resolveStorePath(params.cfg.session?.store, { agentId: params.agentId }),
  };
  let selectedStorePath = fallback.storePath;
  let selectedStore = params.initialStore ?? loadSessionStore(fallback.storePath);
  let selectedMatch = findFreshestStoreMatch(selectedStore, ...scanTargets);
  let selectedUpdatedAt = selectedMatch?.entry.updatedAt ?? Number.NEGATIVE_INFINITY;

  for (let index = 1; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    if (!candidate) {
      continue;
    }
    const store = loadSessionStore(candidate.storePath);
    const match = findFreshestStoreMatch(store, ...scanTargets);
    if (!match) {
      continue;
    }
    const updatedAt = match.entry.updatedAt ?? 0;
    // Mirror combined-store merge behavior so follow-up mutations target the
    // same backing store that won the listing merge when ids collide.
    if (!selectedMatch || updatedAt >= selectedUpdatedAt) {
      selectedStorePath = candidate.storePath;
      selectedStore = store;
      selectedMatch = match;
      selectedUpdatedAt = updatedAt;
    }
  }

  return {
    storePath: selectedStorePath,
    store: selectedStore,
    match: selectedMatch,
  };
}

export function resolveGatewaySessionStoreTarget(params: {
  cfg: RemoteClawConfig;
  key: string;
  scanLegacyKeys?: boolean;
  store?: Record<string, SessionEntry>;
}): {
  agentId: string;
  storePath: string;
  canonicalKey: string;
  storeKeys: string[];
} {
  const key = params.key.trim();
  const canonicalKey = resolveSessionStoreKey({
    cfg: params.cfg,
    sessionKey: key,
  });
  const agentId = resolveSessionStoreAgentId(params.cfg, canonicalKey);
  const { storePath, store } = resolveGatewaySessionStoreLookup({
    cfg: params.cfg,
    key,
    canonicalKey,
    agentId,
    initialStore: params.store,
  });

  if (canonicalKey === "global" || canonicalKey === "unknown") {
    const storeKeys = key && key !== canonicalKey ? [canonicalKey, key] : [key];
    return { agentId, storePath, canonicalKey, storeKeys };
  }

  const storeKeys = new Set<string>();
  storeKeys.add(canonicalKey);
  if (key && key !== canonicalKey) {
    storeKeys.add(key);
  }
  if (params.scanLegacyKeys !== false) {
    // Scan the on-disk store for case variants of every target to find
    // legacy mixed-case entries (e.g. "agent:ops:MAIN" when canonical is "agent:ops:work").
    const scanTargets = buildGatewaySessionStoreScanTargets({
      cfg: params.cfg,
      key,
      canonicalKey,
      agentId,
    });
    for (const seed of scanTargets) {
      for (const legacyKey of findStoreKeysIgnoreCase(store, seed)) {
        storeKeys.add(legacyKey);
      }
    }
  }
  return {
    agentId,
    storePath,
    canonicalKey,
    storeKeys: Array.from(storeKeys),
  };
}

// Merge with existing entry based on latest timestamp to ensure data consistency and avoid overwriting with less complete data.
function mergeSessionEntryIntoCombined(params: {
  cfg: RemoteClawConfig;
  combined: Record<string, SessionEntry>;
  entry: SessionEntry;
  agentId: string;
  canonicalKey: string;
}) {
  const { cfg, combined, entry, agentId, canonicalKey } = params;
  const existing = combined[canonicalKey];

  if (existing && (existing.updatedAt ?? 0) > (entry.updatedAt ?? 0)) {
    combined[canonicalKey] = {
      ...entry,
      ...existing,
      spawnedBy: canonicalizeSpawnedByForAgent(cfg, agentId, existing.spawnedBy ?? entry.spawnedBy),
    };
  } else {
    combined[canonicalKey] = {
      ...existing,
      ...entry,
      spawnedBy: canonicalizeSpawnedByForAgent(
        cfg,
        agentId,
        entry.spawnedBy ?? existing?.spawnedBy,
      ),
    };
  }
}

export function loadCombinedSessionStoreForGateway(cfg: RemoteClawConfig): {
  storePath: string;
  store: Record<string, SessionEntry>;
  /**
   * True when the combined store was loaded from the single configured
   * (non-template) store rather than discovered per-agent stores. Threaded to
   * `resolveLegacyDefaultMainRemap` as the conjunct-4 provenance gate.
   */
  fromSingleStore: boolean;
} {
  const storeConfig = cfg.session?.store;
  if (isSingleConfiguredSessionStore(cfg)) {
    const storePath = resolveStorePath(storeConfig);
    const defaultAgentId = resolveSoleAgentId(cfg) ?? listAgentIds(cfg)[0];
    const store = loadSessionStore(storePath);
    const combined: Record<string, SessionEntry> = {};
    for (const [key, entry] of Object.entries(store)) {
      const canonicalKey = canonicalizeSessionKeyForAgent(defaultAgentId, key);
      mergeSessionEntryIntoCombined({
        cfg,
        combined,
        entry,
        agentId: defaultAgentId,
        canonicalKey,
      });
    }
    return { storePath, store: combined, fromSingleStore: true };
  }

  const targets = resolveAllAgentSessionStoreTargetsSync(cfg);
  const combined: Record<string, SessionEntry> = {};
  for (const target of targets) {
    const agentId = target.agentId;
    const storePath = target.storePath;
    const store = loadSessionStore(storePath);
    for (const [key, entry] of Object.entries(store)) {
      const canonicalKey = canonicalizeSessionKeyForAgent(agentId, key);
      mergeSessionEntryIntoCombined({
        cfg,
        combined,
        entry,
        agentId,
        canonicalKey,
      });
    }
  }

  const storePath =
    typeof storeConfig === "string" && storeConfig.trim() ? storeConfig.trim() : "(multiple)";
  return { storePath, store: combined, fromSingleStore: false };
}

export function getSessionDefaults(cfg: RemoteClawConfig): GatewaySessionsDefaults {
  const resolved = resolveConfiguredModelRef({
    cfg,
    defaultProvider: DEFAULT_PROVIDER,
    defaultModel: DEFAULT_MODEL,
  });
  const contextTokens =
    cfg.agents?.defaults?.contextTokens ??
    lookupContextTokens(resolved.model) ??
    DEFAULT_CONTEXT_TOKENS;
  return {
    modelProvider: resolved.provider ?? null,
    model: resolved.model ?? null,
    contextTokens: contextTokens ?? null,
  };
}

export function resolveSessionModelRef(
  cfg: RemoteClawConfig,
  entry?:
    | SessionEntry
    | Pick<SessionEntry, "model" | "modelProvider" | "modelOverride" | "providerOverride">,
  agentId?: string,
): { provider: string; model: string } {
  const resolved = agentId
    ? resolveDefaultModelForAgent({ cfg, agentId })
    : resolveConfiguredModelRef({
        cfg,
        defaultProvider: DEFAULT_PROVIDER,
        defaultModel: DEFAULT_MODEL,
      });

  // Prefer the last runtime model recorded on the session entry.
  // This is the actual model used by the latest run and must win over defaults.
  let provider = resolved.provider;
  let model = resolved.model;
  const runtimeModel = entry?.model?.trim();
  const runtimeProvider = entry?.modelProvider?.trim();
  if (runtimeModel) {
    if (runtimeProvider) {
      // Provider is explicitly recorded — use it directly. Re-parsing the
      // model string through parseModelRef would incorrectly split OpenRouter
      // vendor-prefixed model names (e.g. model="anthropic/claude-haiku-4.5"
      // with provider="openrouter") into { provider: "anthropic" }, discarding
      // the stored OpenRouter provider and causing direct API calls to a
      // provider the user has no credentials for.
      return { provider: runtimeProvider, model: runtimeModel };
    }
    const parsedRuntime = parseModelRef(runtimeModel, provider || DEFAULT_PROVIDER);
    if (parsedRuntime) {
      provider = parsedRuntime.provider;
      model = parsedRuntime.model;
    } else {
      model = runtimeModel;
    }
    return { provider, model };
  }

  // Fall back to explicit per-session override (set at spawn/model-patch time),
  // then finally to configured defaults.
  const storedModelOverride = entry?.modelOverride?.trim();
  if (storedModelOverride) {
    const overrideProvider = entry?.providerOverride?.trim() || provider || DEFAULT_PROVIDER;
    const parsedOverride = parseModelRef(storedModelOverride, overrideProvider);
    if (parsedOverride) {
      provider = parsedOverride.provider;
      model = parsedOverride.model;
    } else {
      provider = overrideProvider;
      model = storedModelOverride;
    }
  }
  return { provider, model };
}

export function resolveSessionModelIdentityRef(
  cfg: RemoteClawConfig,
  entry?:
    | SessionEntry
    | Pick<SessionEntry, "model" | "modelProvider" | "modelOverride" | "providerOverride">,
  agentId?: string,
): { provider?: string; model: string } {
  const runtimeModel = entry?.model?.trim();
  const runtimeProvider = entry?.modelProvider?.trim();
  if (runtimeModel) {
    if (runtimeProvider) {
      return { provider: runtimeProvider, model: runtimeModel };
    }
    if (runtimeModel.includes("/")) {
      const parsedRuntime = parseModelRef(runtimeModel, DEFAULT_PROVIDER);
      if (parsedRuntime) {
        return { provider: parsedRuntime.provider, model: parsedRuntime.model };
      }
      return { model: runtimeModel };
    }
    return { model: runtimeModel };
  }
  const resolved = resolveSessionModelRef(cfg, entry, agentId);
  return { provider: resolved.provider, model: resolved.model };
}

export function listSessionsFromStore(params: {
  cfg: RemoteClawConfig;
  storePath: string;
  store: Record<string, SessionEntry>;
  opts: import("./protocol/index.js").SessionsListParams;
}): SessionsListResult {
  const { cfg, storePath, store, opts } = params;
  const now = Date.now();

  const includeGlobal = opts.includeGlobal === true;
  const includeUnknown = opts.includeUnknown === true;
  const includeDerivedTitles = opts.includeDerivedTitles === true;
  const includeLastMessage = opts.includeLastMessage === true;
  const spawnedBy = typeof opts.spawnedBy === "string" ? opts.spawnedBy : "";
  const label = typeof opts.label === "string" ? opts.label.trim() : "";
  const agentId = typeof opts.agentId === "string" ? normalizeAgentId(opts.agentId) : "";
  const search = typeof opts.search === "string" ? opts.search.trim().toLowerCase() : "";
  const activeMinutes =
    typeof opts.activeMinutes === "number" && Number.isFinite(opts.activeMinutes)
      ? Math.max(1, Math.floor(opts.activeMinutes))
      : undefined;

  let sessions = Object.entries(store)
    .filter(([key]) => {
      if (isCronRunSessionKey(key)) {
        return false;
      }
      if (!includeGlobal && key === "global") {
        return false;
      }
      if (!includeUnknown && key === "unknown") {
        return false;
      }
      if (agentId) {
        if (key === "global" || key === "unknown") {
          return false;
        }
        const parsed = parseAgentSessionKey(key);
        if (!parsed) {
          return false;
        }
        return normalizeAgentId(parsed.agentId) === agentId;
      }
      return true;
    })
    .filter(([key, entry]) => {
      if (!spawnedBy) {
        return true;
      }
      if (key === "unknown" || key === "global") {
        return false;
      }
      return entry?.spawnedBy === spawnedBy;
    })
    .filter(([, entry]) => {
      if (!label) {
        return true;
      }
      return entry?.label === label;
    })
    .map(([key, entry]) => {
      const updatedAt = entry?.updatedAt ?? null;
      const total = resolveFreshSessionTotalTokens(entry);
      const totalTokensFresh =
        typeof entry?.totalTokens === "number" ? entry?.totalTokensFresh !== false : false;
      const parsed = parseGroupKey(key);
      const channel = entry?.channel ?? parsed?.channel;
      const subject = entry?.subject;
      const groupChannel = entry?.groupChannel;
      const space = entry?.space;
      const id = parsed?.id;
      const origin = entry?.origin;
      const originLabel = origin?.label;
      const displayName =
        entry?.displayName ??
        (channel
          ? buildGroupDisplayName({
              provider: channel,
              subject,
              groupChannel,
              space,
              id,
              key,
            })
          : undefined) ??
        entry?.label ??
        originLabel;
      const deliveryFields = normalizeSessionDeliveryFields(entry);
      const sessionAgentId = resolveSessionKeyAgentId(key, cfg);
      const resolvedModel = resolveSessionModelIdentityRef(cfg, entry, sessionAgentId);
      const modelProvider = resolvedModel.provider;
      const model = resolvedModel.model ?? DEFAULT_MODEL;
      return {
        key,
        entry,
        kind: classifySessionKey(key, entry),
        label: entry?.label,
        displayName,
        channel,
        subject,
        groupChannel,
        space,
        chatType: entry?.chatType,
        origin,
        updatedAt,
        sessionId: entry?.sessionId,
        systemSent: entry?.systemSent,
        abortedLastRun: entry?.abortedLastRun,
        verboseLevel: entry?.verboseLevel,
        reasoningLevel: entry?.reasoningLevel,
        elevatedLevel: entry?.elevatedLevel,
        sendPolicy: entry?.sendPolicy,
        inputTokens: entry?.inputTokens,
        outputTokens: entry?.outputTokens,
        totalTokens: total,
        totalTokensFresh,
        responseUsage: entry?.responseUsage,
        modelProvider,
        model,
        contextTokens: entry?.contextTokens,
        deliveryContext: deliveryFields.deliveryContext,
        lastChannel: deliveryFields.lastChannel ?? entry?.lastChannel,
        lastTo: deliveryFields.lastTo ?? entry?.lastTo,
        lastAccountId: deliveryFields.lastAccountId ?? entry?.lastAccountId,
      };
    })
    .toSorted((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));

  if (search) {
    sessions = sessions.filter((s) => {
      const fields = [s.displayName, s.label, s.subject, s.sessionId, s.key];
      return fields.some((f) => typeof f === "string" && f.toLowerCase().includes(search));
    });
  }

  if (activeMinutes !== undefined) {
    const cutoff = now - activeMinutes * 60_000;
    sessions = sessions.filter((s) => (s.updatedAt ?? 0) >= cutoff);
  }

  if (typeof opts.limit === "number" && Number.isFinite(opts.limit)) {
    const limit = Math.max(1, Math.floor(opts.limit));
    sessions = sessions.slice(0, limit);
  }

  const finalSessions: GatewaySessionRow[] = sessions.map((s) => {
    const { entry, ...rest } = s;
    let derivedTitle: string | undefined;
    let lastMessagePreview: string | undefined;
    if (entry?.sessionId) {
      if (includeDerivedTitles || includeLastMessage) {
        const agentId = resolveSessionKeyAgentId(s.key, cfg);
        const fields = readSessionTitleFieldsFromTranscript(
          entry.sessionId,
          storePath,
          entry.sessionFile,
          agentId,
        );
        if (includeDerivedTitles) {
          derivedTitle = deriveSessionTitle(entry, fields.firstUserMessage);
        }
        if (includeLastMessage && fields.lastMessagePreview) {
          lastMessagePreview = fields.lastMessagePreview;
        }
      }
    }
    return { ...rest, derivedTitle, lastMessagePreview } satisfies GatewaySessionRow;
  });

  return {
    ts: now,
    path: storePath,
    count: finalSessions.length,
    defaults: getSessionDefaults(cfg),
    sessions: finalSessions,
  };
}
