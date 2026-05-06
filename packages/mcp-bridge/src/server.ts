#!/usr/bin/env bun
/**
 * HoloNext MCP bridge.
 *
 * Stdio MCP server that proxies a HoloNext page's Manifest into an MCP-aware client
 * (Claude Code, Codex CLI, etc). Each Action becomes an MCP tool; tools/call is
 * forwarded to the page's HTTP endpoint.
 *
 * Usage (Claude Code):
 *   claude mcp add holonext-cart -- bun run /abs/path/to/this/server.ts
 *
 * Env:
 *   HOLONEXT_BASE_URL   default: http://localhost:3030
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";

const BASE_URL = process.env.HOLONEXT_BASE_URL ?? "http://localhost:3030";

// MCP tool names must match ^[a-zA-Z0-9_-]{1,64}$. HoloNext Action IDs use dots.
const idToToolName = (id: string) => id.replaceAll(".", "__");
const toolNameToId = (name: string) => name.replaceAll("__", ".");

interface ManifestAction {
  id: string;
  kind: string;
  label: string;
  description?: string;
  params: Record<string, unknown>;
  safety?: Record<string, unknown>;
}
interface Manifest {
  page: { title: string; context?: string };
  actions: ManifestAction[];
  state: Record<string, unknown>;
}

async function fetchManifest(): Promise<Manifest> {
  const res = await fetch(`${BASE_URL}/.well-known/agent-manifest.json`);
  if (!res.ok) throw new Error(`manifest fetch failed: ${res.status}`);
  return res.json();
}

function actionsToTools(actions: ManifestAction[]): Tool[] {
  return actions.map((a) => {
    const flags: string[] = [`kind=${a.kind}`];
    if (a.safety?.requires_human_input) flags.push("requires_human_input");
    if (a.safety?.requires_confirmation) flags.push("requires_confirmation");
    if (a.safety?.sensitive_data) flags.push("sensitive_data");
    return {
      name: idToToolName(a.id),
      description: `${a.label}. ${a.description ?? ""} [${flags.join(", ")}]`,
      inputSchema: a.params as Tool["inputSchema"],
    };
  });
}

const server = new Server(
  { name: "holonext-bridge", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  const manifest = await fetchManifest();
  return { tools: actionsToTools(manifest.actions) };
});

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const actionId = toolNameToId(req.params.name);
  const res = await fetch(`${BASE_URL}/api/agent/actions/${actionId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req.params.arguments ?? {}),
  });
  const body = await res.json();
  return {
    content: [{ type: "text", text: JSON.stringify(body, null, 2) }],
    isError: !res.ok,
  };
});

const transport = new StdioServerTransport();
await server.connect(transport);
