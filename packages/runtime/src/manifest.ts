import type { ActionDefinition, Manifest } from "./types.js";
import type { StateStore } from "./state.js";

export interface ManifestConfig {
  page: { url: string; title: string; context?: string };
  events_endpoint?: string;
}

export function buildManifest(
  actions: Map<string, ActionDefinition>,
  state: StateStore,
  cfg: ManifestConfig
): Manifest {
  const actionDefs = Array.from(actions.values()).map(({ perform: _p, ...rest }) => rest);
  return {
    $schema: "https://holonext.dev/schemas/agent-manifest/0.1.0",
    version: "0.1.0",
    page: cfg.page,
    actions: actionDefs,
    state: state.snapshot() as Record<string, unknown>,
    events_endpoint: cfg.events_endpoint ?? "/api/agent/events",
  };
}
