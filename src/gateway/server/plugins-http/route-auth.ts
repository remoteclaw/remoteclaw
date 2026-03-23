import type { PluginRegistry } from "../../../plugins/registry.js";
import {
  isProtectedPluginRoutePathFromContext,
  type PluginRoutePathContext,
} from "./path-context.js";
import { resolvePluginRoutePathContext } from "./path-context.js";
import { findMatchingPluginHttpRoutes } from "./route-match.js";

type PluginHttpRouteEntry = NonNullable<PluginRegistry["httpRoutes"]>[number];

export function matchedPluginRoutesRequireGatewayAuth(
  routes: readonly PluginHttpRouteEntry[],
): boolean {
  return routes.some((route) => route.auth === "gateway");
}

export function shouldEnforceGatewayAuthForPluginPath(
  registry: PluginRegistry,
  pathnameOrContext: string | PluginRoutePathContext,
): boolean {
  const pathContext =
    typeof pathnameOrContext === "string"
      ? resolvePluginRoutePathContext(pathnameOrContext)
      : pathnameOrContext;
  if (pathContext.malformedEncoding || pathContext.decodePassLimitReached) {
    return true;
  }
  if (isProtectedPluginRoutePathFromContext(pathContext)) {
    return true;
  }
  const route = findMatchingPluginHttpRoutes(registry, pathContext)[0];
  if (!route) {
    return false;
  }
  return route.auth === "gateway";
}
