import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { ActionDefinition, ActionEvent } from "./types.js";
import type { EventBus } from "./events.js";
import type { StateStore } from "./state.js";
import { buildManifest, type ManifestConfig } from "./manifest.js";

export interface AgentRoutesConfig {
  page: ManifestConfig["page"];
  state: StateStore;
  bus: EventBus;
  actions: ActionDefinition[];
}

let invocationCounter = 0;
const nextInvocationId = () => `inv-${Date.now().toString(36)}-${(++invocationCounter).toString(36)}`;

export function createAgentRoutes(cfg: AgentRoutesConfig): Hono {
  const app = new Hono();
  const actionMap = new Map<string, ActionDefinition>();
  for (const a of cfg.actions) actionMap.set(a.id, a);

  app.get("/.well-known/agent-manifest.json", (c) =>
    c.json(buildManifest(actionMap, cfg.state, { page: cfg.page }))
  );

  app.get("/api/agent/actions/:id", (c) => {
    const id = c.req.param("id");
    const def = actionMap.get(id);
    if (!def) return c.json({ error: "not_found", id }, 404);
    const { perform: _p, ...rest } = def;
    return c.json(rest);
  });

  app.post("/api/agent/actions/:id", async (c) => {
    const id = c.req.param("id");
    const def = actionMap.get(id);
    if (!def) return c.json({ error: "not_found", id }, 404);

    const params = await c.req.json().catch(() => ({}));
    const invocation_id = (params._invocation_id as string) ?? nextInvocationId();

    cfg.bus.emit({ type: "action.started", action_id: id, invocation_id });
    try {
      const result = await def.perform(params, {
        invocation_id,
        state: cfg.state.snapshot(),
        emit: (e: ActionEvent) => cfg.bus.emit({ ...e, action_id: id, invocation_id }),
      });
      cfg.bus.emit({ type: "action.succeeded", action_id: id, invocation_id, result });
      return c.json({ ok: true, invocation_id, result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      cfg.bus.emit({
        type: "action.failed",
        action_id: id,
        invocation_id,
        error: { code: "INTERNAL_ERROR", message, recoverable: false },
      });
      return c.json({ ok: false, invocation_id, error: message }, 500);
    }
  });

  app.get("/api/agent/events", (c) =>
    streamSSE(c, async (stream) => {
      const unsubscribe = cfg.bus.subscribe((event) => {
        stream.writeSSE({ event: event.type, data: JSON.stringify(event) });
      });
      stream.writeSSE({
        event: "manifest.updated",
        data: JSON.stringify({ type: "manifest.updated", reason: "stream-opened" }),
      });
      while (!stream.aborted) await stream.sleep(15000);
      unsubscribe();
    })
  );

  return app;
}
