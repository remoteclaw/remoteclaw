import { resolveUserPath } from "../../../utils.js";
import type { OnboardOptions } from "../../onboard-types.js";

export function resolveNonInteractiveWorkspaceDir(params: {
  opts: OnboardOptions;
  defaultWorkspaceDir: string;
}) {
  const raw = (params.opts.workspace ?? params.defaultWorkspaceDir).trim();
  return resolveUserPath(raw);
}
