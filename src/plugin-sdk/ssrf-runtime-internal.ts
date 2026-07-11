// Private helper surface for bundled plugins with configured local IPC.
// Keep managed proxy bypass capabilities out of the public plugin SDK surface.
//
// Gutted in RemoteClaw fork — the managed-proxy `proxyline` bypass and the
// configured-local-origin SSRF-guard variant these re-exported were removed
// with the upstream managed-proxy subsystem (the fork's proxy layer is the
// simpler startProxy/stopProxy ProxyHandle, and fetch-guard exposes only
// fetchWithSsrFGuard). No fork consumer imports this surface; the entrypoint
// is retained as an intentionally-empty private-local-only subpath for
// SDK-shape stability. The sentinel keeps this a valid ES module without
// re-exporting any of the gutted managed-proxy internals.
export const SSRF_RUNTIME_INTERNAL_GUTTED = true;
