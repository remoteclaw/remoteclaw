/**
 * Ambient module declarations for deep subpath imports from
 * `@mariozechner/pi-coding-agent`.
 *
 * The package's `exports` map only exposes `"."` and `"./hooks"`, so
 * TypeScript's `NodeNext` module resolution rejects any deeper paths.
 * These declarations make the deep imports type-safe without requiring
 * upstream changes to the package's `exports` field.
 */

declare module "@mariozechner/pi-coding-agent/dist/core/session-manager.js" {
  export { SessionManager } from "@mariozechner/pi-coding-agent";
}
