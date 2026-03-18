import { createHybridChannelConfigAdapter } from "remoteclaw/plugin-sdk/channel-config-helpers";
import type { ChannelAccountSnapshot, ChannelPlugin } from "remoteclaw/plugin-sdk/channel-runtime";
import type { RemoteClawConfig } from "remoteclaw/plugin-sdk/config-runtime";
import { createLazyRuntimeModule } from "remoteclaw/plugin-sdk/lazy-runtime";
import { tlonChannelConfigSchema } from "./config-schema.js";
import { resolveTlonOutboundSessionRoute } from "./session-route.js";
import {
  applyTlonSetupConfig,
  createTlonSetupWizardBase,
  resolveTlonSetupConfigured,
  tlonSetupAdapter,
} from "./setup-core.js";
import {
  applyAccountNameToChannelSection,
  DEFAULT_ACCOUNT_ID,
  normalizeAccountId,
} from "remoteclaw/plugin-sdk";
import { buildTlonAccountFields } from "./account-fields.js";
import { tlonChannelConfigSchema } from "./config-schema.js";
import { monitorTlonProvider } from "./monitor/index.js";
import { tlonOnboardingAdapter } from "./onboarding.js";
import { formatTargetHint, normalizeShip, parseTlonTarget } from "./targets.js";
import { resolveTlonAccount, listTlonAccountIds } from "./types.js";
import { authenticate } from "./urbit/auth.js";
import { ssrfPolicyFromAllowPrivateNetwork } from "./urbit/context.js";
import { urbitFetch } from "./urbit/fetch.js";
import {
  buildMediaStory,
  sendDm,
  sendGroupMessage,
  sendDmWithStory,
  sendGroupMessageWithStory,
} from "./urbit/send.js";
import { uploadImageFromUrl } from "./urbit/upload.js";

// Simple HTTP-only poke that doesn't open an EventSource (avoids conflict with monitor's SSE)
async function createHttpPokeApi(params: {
  url: string;
  code: string;
  ship: string;
  allowPrivateNetwork?: boolean;
}) {
  const ssrfPolicy = ssrfPolicyFromAllowPrivateNetwork(params.allowPrivateNetwork);
  const cookie = await authenticate(params.url, params.code, { ssrfPolicy });
  const channelId = `${Math.floor(Date.now() / 1000)}-${crypto.randomUUID()}`;
  const channelPath = `/~/channel/${channelId}`;
  const shipName = params.ship.replace(/^~/, "");

  return {
    poke: async (pokeParams: { app: string; mark: string; json: unknown }) => {
      const pokeId = Date.now();
      const pokeData = {
        id: pokeId,
        action: "poke",
        ship: shipName,
        app: pokeParams.app,
        mark: pokeParams.mark,
        json: pokeParams.json,
      };

      // Use urbitFetch for consistent SSRF protection (DNS pinning + redirect handling)
      const { response, release } = await urbitFetch({
        baseUrl: params.url,
        path: channelPath,
        init: {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Cookie: cookie.split(";")[0],
          },
          body: JSON.stringify([pokeData]),
        },
        ssrfPolicy,
        auditContext: "tlon-poke",
      });

      try {
        if (!response.ok && response.status !== 204) {
          const errorText = await response.text();
          throw new Error(`Poke failed: ${response.status} - ${errorText}`);
        }

        return pokeId;
      } finally {
        await release();
      }
    },
    delete: async () => {
      // No-op for HTTP-only client
    },
  };
}

const TLON_CHANNEL_ID = "tlon" as const;

const loadTlonChannelRuntime = createLazyRuntimeModule(() => import("./channel.runtime.js"));

const tlonSetupWizardProxy = createTlonSetupWizardBase({
  resolveConfigured: async ({ cfg }) =>
    await (await loadTlonChannelRuntime()).tlonSetupWizard.status.resolveConfigured({ cfg }),
  resolveStatusLines: async ({ cfg, configured }) =>
    (await (
      await loadTlonChannelRuntime()
    ).tlonSetupWizard.status.resolveStatusLines?.({
      cfg,
      configured,
    })) ?? [],
  finalize: async (params) =>
    await (
      await loadTlonChannelRuntime()
    ).tlonSetupWizard.finalize!(params),
}) satisfies NonNullable<ChannelPlugin["setupWizard"]>;

const tlonConfigAdapter = createHybridChannelConfigAdapter({
  sectionKey: TLON_CHANNEL_ID,
  listAccountIds: (cfg: RemoteClawConfig) => listTlonAccountIds(cfg),
  resolveAccount: (cfg: RemoteClawConfig, accountId?: string | null) =>
    resolveTlonAccount(cfg, accountId ?? undefined),
  defaultAccountId: () => "default",
  clearBaseFields: ["ship", "code", "url", "name"],
  preserveSectionOnDefaultDelete: true,
  resolveAllowFrom: (account) => account.dmAllowlist,
  formatAllowFrom: (allowFrom) =>
    allowFrom.map((entry) => normalizeShip(String(entry))).filter(Boolean),
});

export const tlonPlugin: ChannelPlugin = {
  id: TLON_CHANNEL_ID,
  meta: {
    id: TLON_CHANNEL_ID,
    label: "Tlon",
    selectionLabel: "Tlon (Urbit)",
    docsPath: "/channels/tlon",
    docsLabel: "tlon",
    blurb: "Decentralized messaging on Urbit",
    aliases: ["urbit"],
    order: 90,
  },
  capabilities: {
    chatTypes: ["direct", "group", "thread"],
    media: true,
    reply: true,
    threads: true,
  },
  onboarding: tlonOnboardingAdapter,
  reload: { configPrefixes: ["channels.tlon"] },
  configSchema: tlonChannelConfigSchema,
  config: {
    ...tlonConfigAdapter,
    isConfigured: (account) => account.configured,
    describeAccount: (account) =>
      describeAccountSnapshot({
        account,
        configured: account.configured,
        extra: {
          ship: account.ship,
          url: account.url,
        },
      }),
  },
  setup: {
    resolveAccountId: ({ accountId }) => normalizeAccountId(accountId),
    applyAccountName: ({ cfg, accountId, name }) =>
      applyAccountNameToChannelSection({
        cfg: cfg,
        channelKey: "tlon",
        accountId,
        name,
      }),
    validateInput: ({ cfg, accountId, input }) => {
      const setupInput = input as TlonSetupInput;
      const resolved = resolveTlonAccount(cfg, accountId ?? undefined);
      const ship = setupInput.ship?.trim() || resolved.ship;
      const url = setupInput.url?.trim() || resolved.url;
      const code = setupInput.code?.trim() || resolved.code;
      if (!ship) {
        return "Tlon requires --ship.";
      }
      if (!url) {
        return "Tlon requires --url.";
      }
      if (!code) {
        return "Tlon requires --code.";
      }
      return null;
    },
    applyAccountConfig: ({ cfg, accountId, input }) =>
      applyTlonSetupConfig({
        cfg: cfg,
        accountId,
        input: input as TlonSetupInput,
      }),
  },
  messaging: {
    normalizeTarget: (target) => {
      const parsed = parseTlonTarget(target);
      if (!parsed) {
        return target.trim();
      }
      if (parsed.kind === "dm") {
        return parsed.ship;
      }
      return parsed.nest;
    },
    targetResolver: {
      looksLikeId: (target) => Boolean(parseTlonTarget(target)),
      hint: formatTargetHint(),
    },
  },
  outbound: tlonOutbound,
  status: {
    defaultRuntime: {
      accountId: "default",
      running: false,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
    },
    collectStatusIssues: (accounts) => {
      return accounts.flatMap((account) => {
        if (!account.configured) {
          return [
            {
              channel: TLON_CHANNEL_ID,
              accountId: account.accountId,
              kind: "config",
              message: "Account not configured (missing ship, code, or url)",
            },
          ];
        }
        return [];
      });
    },
    buildChannelSummary: ({ snapshot }) => {
      const s = snapshot as { configured?: boolean; ship?: string; url?: string };
      return {
        configured: s.configured ?? false,
        ship: s.ship ?? null,
        url: s.url ?? null,
      };
    },
    probeAccount: async ({ account }) => {
      if (!account.configured || !account.ship || !account.url || !account.code) {
        return { ok: false, error: "Not configured" };
      }
      try {
        const ssrfPolicy = ssrfPolicyFromAllowPrivateNetwork(account.allowPrivateNetwork);
        const cookie = await authenticate(account.url, account.code, { ssrfPolicy });
        // Simple probe - just verify we can reach /~/name
        const { response, release } = await urbitFetch({
          baseUrl: account.url,
          path: "/~/name",
          init: {
            method: "GET",
            headers: { Cookie: cookie },
          },
          ssrfPolicy,
          timeoutMs: 30_000,
          auditContext: "tlon-probe-account",
        });
        try {
          if (!response.ok) {
            return { ok: false, error: `Name request failed: ${response.status}` };
          }
          return { ok: true };
        } finally {
          await release();
        }
      } catch (error) {
        return { ok: false, error: (error as { message?: string })?.message ?? String(error) };
      }
    },
    buildAccountSnapshot: ({ account, runtime, probe }) => {
      // Tlon-specific snapshot with ship/url for status display
      const snapshot = {
        accountId: account.accountId,
        name: account.name,
        enabled: account.enabled,
        configured: account.configured,
        ship: account.ship,
        url: account.url,
        running: runtime?.running ?? false,
        lastStartAt: runtime?.lastStartAt ?? null,
        lastStopAt: runtime?.lastStopAt ?? null,
        lastError: runtime?.lastError ?? null,
        probe,
      };
      return snapshot as import("remoteclaw/plugin-sdk").ChannelAccountSnapshot;
    },
  },
  gateway: {
    startAccount: async (ctx) => {
      const account = ctx.account;
      ctx.setStatus({
        accountId: account.accountId,
        ship: account.ship,
        url: account.url,
      } as import("remoteclaw/plugin-sdk").ChannelAccountSnapshot);
      ctx.log?.info(`[${account.accountId}] starting Tlon provider for ${account.ship ?? "tlon"}`);
      return monitorTlonProvider({
        runtime: ctx.runtime,
        abortSignal: ctx.abortSignal,
        accountId: account.accountId,
      });
    },
  },
};
