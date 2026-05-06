#!/usr/bin/env bun
/**
 * HoloNext MCP bridge.
 *
 * Stdio MCP server that proxies a HoloNext page's Manifest into an MCP-aware client
 * (Claude Code, Codex CLI, etc). Each Action becomes an MCP tool; tools/call is
 * forwarded to the page's HTTP endpoint, and action.progress events are
 * forwarded as MCP notifications/progress for long-running tools.
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
  behavior?: { long_running?: boolean; estimated_duration_ms?: number };
}
interface Manifest {
  page: { title: string; context?: string };
  actions: ManifestAction[];
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
    if (a.behavior?.long_running) flags.push("long_running");
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

let invocationCounter = 0;
const nextInvocationId = () => `mcp-${Date.now().toString(36)}-${(++invocationCounter).toString(36)}`;

/**
 * Subscribe to the page event stream for the duration of a tool call,
 * and forward `action.progress` events that match our invocation_id
 * as MCP `notifications/progress` notifications.
 *
 * Hand-rolled SSE parser — Bun does not expose a global EventSource.
 */
function subscribeProgress(
  invocationId: string,
  progressToken: string | number,
): () => void {
  const controller = new AbortController();
  (async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/agent/events`, {
        headers: { Accept: "text/event-stream" },
        signal: controller.signal,
      });
      if (!res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        // SSE messages are separated by blank lines
        let sep: number;
        while ((sep = buf.indexOf("\n\n")) !== -1) {
          const block = buf.slice(0, sep);
          buf = buf.slice(sep + 2);
          let event = "message";
          let dataLine = "";
          for (const line of block.split("\n")) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            else if (line.startsWith("data:")) dataLine += line.slice(5).trim();
          }
          if (event !== "action.progress" || !dataLine) continue;
          try {
            const data = JSON.parse(dataLine);
            if (data.invocation_id !== invocationId) continue;
            server.notification({
              method: "notifications/progress",
              params: {
                progressToken,
                progress: data.percent ?? 0,
                total: 100,
                message: data.message ?? data.stage ?? "",
              },
            });
          } catch { /* malformed event */ }
        }
      }
    } catch (err) {
      if ((err as { name?: string })?.name !== "AbortError") {
        console.error("[mcp-bridge] SSE error:", err);
      }
    }
  })();
  return () => controller.abort();
}

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const actionId = toolNameToId(req.params.name);
  const progressToken = req.params._meta?.progressToken;
  const invocationId = nextInvocationId();

  const unsubscribe = progressToken !== undefined
    ? subscribeProgress(invocationId, progressToken as string | number)
    : null;

  try {
    const res = await fetch(`${BASE_URL}/api/agent/actions/${actionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...(req.params.arguments ?? {}), _invocation_id: invocationId }),
    });
    const body = await res.json();
    return {
      content: [{ type: "text", text: JSON.stringify(body, null, 2) }],
      isError: !res.ok,
    };
  } finally {
    unsubscribe?.();
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
