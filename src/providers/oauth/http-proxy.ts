/**
 * Set up HTTP proxy according to env variables for `fetch` based SDKs in Node.js.
 * Bun has builtin support for this.
 *
 * This module should be imported early by any code that needs proxy support for fetch().
 * ES modules are cached, so importing multiple times is safe — setup only runs once.
 *
 * Extracted from @mariozechner/pi-ai to remove the runtime dependency.
 */
if (typeof process !== "undefined" && process.versions?.node) {
  void import("undici").then((m) => {
    const { EnvHttpProxyAgent, setGlobalDispatcher } = m;
    setGlobalDispatcher(new EnvHttpProxyAgent());
  });
}
