import type { ActionDefinition } from "./types.js";

export function defineAction<TParams = unknown, TResult = unknown>(
  def: ActionDefinition<TParams, TResult>
): ActionDefinition<TParams, TResult> {
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(def.id)) {
    throw new Error(`Invalid action id: ${def.id} (expected scope.verb[.qualifier])`);
  }
  if (def.kind === "query" && !def.returns) {
    throw new Error(`Query action ${def.id} MUST declare returns schema`);
  }
  return def;
}
