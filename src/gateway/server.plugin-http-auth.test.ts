import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, test, vi } from "vitest";
import {
  AUTH_NONE,
  AUTH_TOKEN,
  createHooksHandler,
  createTestGatewayServer,
  sendRequest,
  withGatewayServer,
  withGatewayTempConfig,
} from "./server-http.test-harness.js";

type PluginRequestHandler = (req: IncomingMessage, res: ServerResponse) => Promise<boolean>;

function createRootMountedControlUiOverrides(handlePluginRequest: PluginRequestHandler) {
  return {
    controlUiEnabled: true,
    controlUiBasePath: "",
    controlUiRoot: { kind: "missing" as const },
    handlePluginRequest,
  };
}

const withRootMountedControlUiServer = (params: {
  prefix: string;
  handlePluginRequest: PluginRequestHandler;
  run: Parameters<typeof withGatewayServer>[0]["run"];
}) =>
  withPluginGatewayServer({
    prefix: params.prefix,
    resolvedAuth: AUTH_NONE,
    overrides: createRootMountedControlUiOverrides(params.handlePluginRequest),
    run: params.run,
  });

const withPluginGatewayServer = (params: Parameters<typeof withGatewayServer>[0]) =>
  withGatewayServer(params);

describe("gateway plugin HTTP auth boundary", () => {
  test("applies default security headers and optional strict transport security", async () => {
    await withGatewayTempConfig("remoteclaw-plugin-http-security-headers-test-", async () => {
      const withoutHsts = createTestGatewayServer({ resolvedAuth: AUTH_NONE });
      const withoutHstsResponse = await sendRequest(withoutHsts, { path: "/missing" });
      expect(withoutHstsResponse.setHeader).toHaveBeenCalledWith(
        "X-Content-Type-Options",
        "nosniff",
      );
      expect(withoutHstsResponse.setHeader).toHaveBeenCalledWith("Referrer-Policy", "no-referrer");
      expect(withoutHstsResponse.setHeader).not.toHaveBeenCalledWith(
        "Strict-Transport-Security",
        expect.any(String),
      );

      const withHsts = createTestGatewayServer({
        resolvedAuth: AUTH_NONE,
        overrides: {
          strictTransportSecurityHeader: "max-age=31536000; includeSubDomains",
        },
      });
      const withHstsResponse = await sendRequest(withHsts, { path: "/missing" });
      expect(withHstsResponse.setHeader).toHaveBeenCalledWith(
        "Strict-Transport-Security",
        "max-age=31536000; includeSubDomains",
      );
    });
  });

  test("serves unauthenticated liveness/readiness probe routes when no other route handles them", async () => {
    await withGatewayServer({
      prefix: "remoteclaw-plugin-http-probes-test-",
      resolvedAuth: AUTH_TOKEN,
      run: async (server) => {
        const probeCases = [
          { path: "/health", status: "live" },
          { path: "/healthz", status: "live" },
          { path: "/ready", status: "ready" },
          { path: "/readyz", status: "ready" },
        ] as const;

        for (const probeCase of probeCases) {
          const response = await sendRequest(server, { path: probeCase.path });
          expect(response.res.statusCode, probeCase.path).toBe(200);
          expect(response.getBody(), probeCase.path).toBe(
            JSON.stringify({ ok: true, status: probeCase.status }),
          );
        }
      },
    });
  });

  test("does not shadow plugin routes mounted on probe paths", async () => {
    const handlePluginRequest = vi.fn(async (req: IncomingMessage, res: ServerResponse) => {
      const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
      if (pathname === "/healthz") {
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ ok: true, route: "plugin-health" }));
        return true;
      }
      return false;
    });

    await withGatewayServer({
      prefix: "remoteclaw-plugin-http-probes-shadow-test-",
      resolvedAuth: AUTH_NONE,
      overrides: { handlePluginRequest },
      run: async (server) => {
        const response = await sendRequest(server, { path: "/healthz" });
        expect(response.res.statusCode).toBe(200);
        expect(response.getBody()).toBe(JSON.stringify({ ok: true, route: "plugin-health" }));
        expect(handlePluginRequest).toHaveBeenCalledTimes(1);
      },
    });
  });

  test("rejects non-GET/HEAD methods on probe routes", async () => {
    await withGatewayServer({
      prefix: "remoteclaw-plugin-http-probes-method-test-",
      resolvedAuth: AUTH_NONE,
      run: async (server) => {
        const postResponse = await sendRequest(server, { path: "/healthz", method: "POST" });
        expect(postResponse.res.statusCode).toBe(405);
        expect(postResponse.setHeader).toHaveBeenCalledWith("Allow", "GET, HEAD");
        expect(postResponse.getBody()).toBe("Method Not Allowed");

        const headResponse = await sendRequest(server, { path: "/readyz", method: "HEAD" });
        expect(headResponse.res.statusCode).toBe(200);
        expect(headResponse.getBody()).toBe("");
      },
    });
  });

  test("serves plugin routes before control ui spa fallback", async () => {
    const handlePluginRequest = vi.fn(async (req: IncomingMessage, res: ServerResponse) => {
      const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
      if (pathname === "/plugins/diffs/view/demo-id/demo-token") {
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end("<!doctype html><title>diff-view</title>");
        return true;
      }
      return false;
    });

    await withRootMountedControlUiServer({
      prefix: "remoteclaw-plugin-http-control-ui-precedence-test-",
      handlePluginRequest,
      run: async (server) => {
        const response = await sendRequest(server, {
          path: "/plugins/diffs/view/demo-id/demo-token",
        });

        expect(response.res.statusCode).toBe(200);
        expect(response.getBody()).toContain("diff-view");
        expect(handlePluginRequest).toHaveBeenCalledTimes(1);
      },
    });
  });

  test("passes POST webhook routes through root-mounted control ui to plugins", async () => {
    const handlePluginRequest = vi.fn(async (req: IncomingMessage, res: ServerResponse) => {
      const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
      if (req.method !== "POST" || pathname !== "/bluebubbles-webhook") {
        return false;
      }
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("plugin-webhook");
      return true;
    });

    await withRootMountedControlUiServer({
      prefix: "remoteclaw-plugin-http-control-ui-webhook-post-test-",
      handlePluginRequest,
      run: async (server) => {
        const response = await sendRequest(server, {
          path: "/bluebubbles-webhook",
          method: "POST",
        });

        expect(response.res.statusCode).toBe(200);
        expect(response.getBody()).toBe("plugin-webhook");
        expect(handlePluginRequest).toHaveBeenCalledTimes(1);
      },
    });
  });

  test("plugin routes take priority over control ui catch-all", async () => {
    const handlePluginRequest = vi.fn(async (req: IncomingMessage, res: ServerResponse) => {
      const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
      if (pathname === "/my-plugin/inbound") {
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end("plugin-handled");
        return true;
      }
      return false;
    });

    await withRootMountedControlUiServer({
      prefix: "remoteclaw-plugin-http-control-ui-shadow-test-",
      handlePluginRequest,
      run: async (server) => {
        const response = await sendRequest(server, { path: "/my-plugin/inbound" });

        expect(response.res.statusCode).toBe(200);
        expect(response.getBody()).toContain("plugin-handled");
        expect(handlePluginRequest).toHaveBeenCalledTimes(1);
      },
    });
  });

  test("unmatched plugin paths fall through to control ui", async () => {
    const handlePluginRequest = vi.fn(async () => false);

    await withRootMountedControlUiServer({
      prefix: "remoteclaw-plugin-http-control-ui-fallthrough-test-",
      handlePluginRequest,
      run: async (server) => {
        const response = await sendRequest(server, { path: "/chat" });

        expect(handlePluginRequest).toHaveBeenCalledTimes(1);
        expect(response.res.statusCode).toBe(503);
        expect(response.getBody()).toContain("Control UI assets not found");
      },
    });
  });

  test.each(["0.0.0.0", "::"])(
    "returns 404 (not 500) for non-hook routes with hooks enabled and bindHost=%s",
    async (bindHost) => {
      await withGatewayTempConfig("remoteclaw-plugin-http-hooks-bindhost-", async () => {
        const handleHooksRequest = createHooksHandler(bindHost);
        const server = createTestGatewayServer({
          resolvedAuth: AUTH_NONE,
          overrides: { handleHooksRequest },
        });

        const response = await sendRequest(server, { path: "/" });

        expect(response.res.statusCode).toBe(404);
        expect(response.getBody()).toBe("Not Found");
      });
    },
  );

  test("rejects query-token hooks requests with bindHost=::", async () => {
    await withGatewayTempConfig("remoteclaw-plugin-http-hooks-query-token-", async () => {
      const handleHooksRequest = createHooksHandler("::");
      const server = createTestGatewayServer({
        resolvedAuth: AUTH_NONE,
        overrides: { handleHooksRequest },
      });

      const response = await sendRequest(server, { path: "/hooks/wake?token=bad" });

      expect(response.res.statusCode).toBe(400);
      expect(response.getBody()).toContain("Hook token must be provided");
    });
  });
});
