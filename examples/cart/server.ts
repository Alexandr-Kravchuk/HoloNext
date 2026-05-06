import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { createAgentRoutes, EventBus, StateStore } from "@holonext/runtime";
import { buildActions, initialState } from "./actions.js";

const bus = new EventBus();
const state = new StateStore(initialState, bus);
const actions = buildActions(state);

const app = new Hono();
app.route("/", createAgentRoutes({
  page: {
    url: "http://localhost:3000",
    title: "HoloNext Demo Cart",
    context: "Demo cart with 3 products. User can add/remove/clear items.",
  },
  state,
  bus,
  actions,
}));
app.get("/*", serveStatic({ root: "./public" }));

const port = Number(process.env.PORT) || 3000;
console.log(`HoloNext cart demo listening on http://localhost:${port}`);
console.log(`Manifest: http://localhost:${port}/.well-known/agent-manifest.json`);

export default { port, fetch: app.fetch };
