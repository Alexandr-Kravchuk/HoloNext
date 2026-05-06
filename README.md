# HoloNext Agent Framework

Experimental web framework for AI-agent-friendly pages — see [`docs/agent-framework/`](docs/agent-framework/).

**Status:** pre-release, in active design. License: [MIT](LICENSE). Governance: [docs/governance.md](docs/governance.md).

## Repo layout

```
packages/runtime           # @holonext/runtime — defineAction, createAgentRoutes
packages/mcp-bridge        # stdio MCP server proxying Manifest → Claude Code / Codex
examples/cart              # demo cart with HTML UI + agent endpoints
examples/agent-client      # alt. standalone agent (Anthropic SDK, requires API key)
docs/agent-framework       # research summary + MVP specification
```

## Run the prototype with Claude Code (no API key needed)

Requirements: [Bun](https://bun.sh) ≥ 1.3, [Claude Code](https://claude.com/claude-code) installed.

```bash
bun install

# Terminal 1 — start the demo cart server (browse to http://localhost:3030)
bun run dev:cart

# One-time: register the MCP bridge with Claude Code
claude mcp add holonext-cart -- bun run /Users/a.kravchuk/Projects/HoloNext/packages/mcp-bridge/src/server.ts

# Now in any Claude Code session you can say:
#   "Use the holonext-cart tools to add an iPhone and AirPods, then tell me the total."
# Claude Code will call cart__add via MCP, which proxies to our HTTP endpoints.
```

The cart UI and the MCP-driven agent share the same `/api/agent/*` endpoints — open
the browser while Claude Code drives the cart and you'll see live updates via SSE.

## Alternative: direct Anthropic SDK loop (requires API key)

```bash
ANTHROPIC_API_KEY=sk-ant-... bun run dev:agent
```

## Endpoints (cart demo)

- `GET /.well-known/agent-manifest.json` — Manifest with actions + state
- `GET /api/agent/actions/:id` — single Action Definition
- `POST /api/agent/actions/:id` — execute Action
- `GET /api/agent/events` — SSE event stream
