#!/usr/bin/env bash
# Idempotent issue + label setup for HoloNext v0.1.0 release plan.
# Run: bash scripts/create-issues.sh
# Re-running creates labels safely; skips issues whose exact title already exists.

set -euo pipefail

REPO="${REPO:-Alexandr-Kravchuk/HoloNext}"

ensure_label() {
  local name="$1" color="$2" desc="$3"
  if gh label list --repo "$REPO" --limit 200 | awk '{print $1}' | grep -Fxq "$name"; then
    gh label edit "$name" --repo "$REPO" --color "$color" --description "$desc" >/dev/null
  else
    gh label create "$name" --repo "$REPO" --color "$color" --description "$desc" >/dev/null
  fi
  echo "  label ok: $name"
}

issue_exists() {
  local title="$1"
  gh issue list --repo "$REPO" --state all --search "in:title \"$title\"" --json title \
    --jq ".[] | select(.title==\"$title\") | .title" | grep -Fxq "$title"
}

create_issue() {
  local title="$1" body="$2" labels="$3"
  if issue_exists "$title"; then
    echo "  skip (exists): $title"
    return
  fi
  gh issue create --repo "$REPO" --title "$title" --body "$body" --label "$labels" >/dev/null
  echo "  created: $title"
}

echo "==> Ensuring labels"
ensure_label "track:runtime"  "1d76db" "Track A — @holonext/runtime hardening"
ensure_label "track:cli"      "0e8a16" "Track B — holonext CLI tooling"
ensure_label "track:examples" "fbca04" "Track C — example apps"
ensure_label "track:docs"     "5319e7" "Track D — documentation"
ensure_label "track:bridge"   "006b75" "Track E — @holonext/mcp-bridge"
ensure_label "track:site"     "d93f0b" "Track F — site & GTM"
ensure_label "track:infra"    "c5def5" "Track G — infrastructure"
ensure_label "track:spec"     "bfd4f2" "Track H — spec evolution"
ensure_label "critical-path"  "b60205" "Blocks the v0.1.0 release"
ensure_label "enabler"        "0052cc" "Unblocks downstream work"

echo
echo "==> Creating issues"

# ---------------------------------------------------------------------------
# Track A — runtime
# ---------------------------------------------------------------------------

create_issue "[A0] Set up Bun test infrastructure" \
"**Context.** Runtime currently has no tests. Block other A* work behind a working test setup.

**Acceptance criteria:**
- [ ] \`bun test\` runs from repo root and per-package
- [ ] First happy-path tests for \`defineAction\`, manifest builder, state patches
- [ ] CI placeholder workflow that runs tests on PR

**Dependencies:** none.

**Track:** A · **Effort:** ~1 day · **Type:** enabler" \
"track:runtime,critical-path,enabler"

create_issue "[A1] JSON Logic preconditions evaluator" \
"**Context.** Spec decision #3 chose JSON Logic; runtime stores preconditions but does not evaluate. Add server-side check before \`perform\`. If precondition fails, emit \`action.failed\` with \`code: PRECONDITION_FAILED\`.

**Acceptance criteria:**
- [ ] \`json-logic-js\` (or equivalent) integrated
- [ ] Precondition evaluated against current state snapshot before \`perform\`
- [ ] On failure: emit \`action.failed\` with structured error
- [ ] Tests: passing precondition runs action, failing precondition rejects without side effects

**Dependencies:** A0 (test infra), A2 (error model).

**Track:** A · **Effort:** ~1 day" \
"track:runtime"

create_issue "[A2] Typed ActionError model with standard codes" \
"**Context.** Errors are currently ad-hoc strings. Define a typed model so the agent can reason about recovery.

**Acceptance criteria:**
- [ ] \`ActionError\` class with \`code\`, \`message\`, \`recoverable\`, \`details\`
- [ ] Standard codes enum: \`UNKNOWN_ENTITY\`, \`VERSION_CONFLICT\`, \`PERMISSION_DENIED\`, \`OUT_OF_STOCK\`, \`PRECONDITION_FAILED\`, \`VALIDATION_FAILED\`, \`INTERNAL_ERROR\`, \`HUMAN_INPUT_REQUIRED\`
- [ ] Throwing \`ActionError\` from \`perform\` produces structured \`action.failed\` event
- [ ] Documented in spec / API reference

**Dependencies:** A0.

**Track:** A · **Effort:** ~2 days · **Type:** enabler" \
"track:runtime,critical-path,enabler"

create_issue "[A3] Reserved params handling (\`_invocation_id\`, \`_bypass_cache\`)" \
"**Context.** Spec §2.2 reserves underscore-prefixed params as framework-controlled. Middleware should extract and not pass them to user \`perform\`.

**Acceptance criteria:**
- [ ] Underscore-prefixed params filtered out before \`perform(params, ctx)\` is called
- [ ] \`_invocation_id\` overrides server-generated invocation ID for idempotency
- [ ] \`_bypass_cache\` accessible to query Actions via \`ctx\` (cache layer is per-action; runtime just exposes the flag)
- [ ] Tests cover both reserved params

**Dependencies:** A0.

**Track:** A · **Effort:** ~0.5 day" \
"track:runtime"

create_issue "[A4] Generic typing for \`defineAction<TParams, TResult>\`" \
"**Context.** Currently \`defineAction\` is loosely typed with \`unknown\`. Improve DX by inferring/threading param + result types.

**Acceptance criteria:**
- [ ] \`defineAction<TParams, TResult>\` exposes typed \`perform(params: TParams, ctx): Promise<TResult>\`
- [ ] Either: (a) manual type params, or (b) JSON-Schema-to-type inference (best-effort)
- [ ] Existing examples compile cleanly with no \`any\`
- [ ] Documented in API reference

**Dependencies:** A0.

**Track:** A · **Effort:** ~1 day" \
"track:runtime"

create_issue "[A5] \`requires_confirmation\` enforcement" \
"**Context.** Safety flag is declared in spec but runtime ignores it. Implement: server emits \`action.requires_confirmation\`, waits for explicit confirm call (POST \`/api/agent/actions/:id/confirm/:invocation_id\`).

**Acceptance criteria:**
- [ ] Action with \`requires_confirmation: true\` emits \`action.requires_confirmation\` instead of running \`perform\`
- [ ] Pending confirmations stored in-memory with timeout (5 min default)
- [ ] Confirm endpoint resumes execution; reject endpoint cancels with \`action.failed\`
- [ ] Tests: confirm path, reject path, timeout path

**Dependencies:** A0, A2.

**Track:** A · **Effort:** ~1.5 days" \
"track:runtime"

create_issue "[A6] Heartbeat events in event stream" \
"**Context.** SSE/WebTransport streams need keep-alive. Currently \`stream.sleep(15000)\` is brittle and emits nothing meaningful between events.

**Acceptance criteria:**
- [ ] \`_heartbeat\` event every 5s when stream is idle
- [ ] Documented (\`_\` prefix marks transport-control events; not part of public ActionEventType union)
- [ ] Tested: idle stream stays open ≥30s without disconnect

**Dependencies:** A0.

**Track:** A · **Effort:** ~0.3 day" \
"track:runtime"

create_issue "[A7] Graceful shutdown and connection cleanup" \
"**Context.** On server shutdown, open SSE streams should close cleanly. AbortController on \`bus.subscribe\` should release listeners.

**Acceptance criteria:**
- [ ] SIGTERM closes all open event streams within 1s
- [ ] No leaked \`bus\` listeners after a stream disconnects (verify by counting)
- [ ] Test: many open/close cycles, listener count stays bounded

**Dependencies:** A0.

**Track:** A · **Effort:** ~0.5 day" \
"track:runtime"

create_issue "[A8] Public API freeze ceremony for v0.1.0" \
"**Context.** Once A1-A7 land, freeze \`@holonext/runtime\` public API surface. Document what is stable, what is internal, what may change in v0.2.

**Acceptance criteria:**
- [ ] \`packages/runtime/API.md\` enumerates stable exports
- [ ] Internal modules marked with \`@internal\` JSDoc
- [ ] No accidental re-exports of internal types
- [ ] CHANGELOG entry for 0.1.0 includes API surface

**Dependencies:** A1, A2, A3, A4, A5, A6, A7.

**Track:** A · **Effort:** ~0.5 day · **Type:** milestone" \
"track:runtime,critical-path"

# ---------------------------------------------------------------------------
# Track B — CLI tooling
# ---------------------------------------------------------------------------

create_issue "[B1] Define entry-point discovery convention (RFC)" \
"**Context.** CLI needs to know where to find Action definitions in a user project. Decide: glob like \`src/actions/**/*.ts\`, explicit config, or hybrid.

**Acceptance criteria:**
- [ ] RFC document in \`docs/rfcs/0001-entry-points.md\`
- [ ] Decision recorded with rationale and rejected alternatives
- [ ] Default convention works for cart example without configuration

**Dependencies:** none.

**Track:** B · **Effort:** ~0.5 day · **Type:** enabler" \
"track:cli,enabler"

create_issue "[B2] Implement \`holonext build\`" \
"**Context.** Compile-time mode: scan entry points, collect Actions, emit static manifest + per-action JSON files.

**Acceptance criteria:**
- [ ] CLI subcommand \`holonext build\`
- [ ] Outputs \`dist/agent-manifest.json\` and \`dist/actions/<id>.json\`
- [ ] Validates JSON Schema and JSON Logic preconditions during build
- [ ] Errors on duplicate Action IDs
- [ ] Cart example builds successfully and output matches live manifest

**Dependencies:** B1, A2.

**Track:** B · **Effort:** ~2 days" \
"track:cli"

create_issue "[B3] \`holonext diff\` for breaking change detection" \
"**Context.** Compares two manifests, classifies changes as BREAKING / NON-BREAKING, exits non-zero on breaking changes.

**Acceptance criteria:**
- [ ] Compares previous and current manifest files
- [ ] BREAKING: removed Action, removed required field, changed enum value, changed kind
- [ ] NON-BREAKING: added Action, added optional field, description change
- [ ] Output: human-readable summary + machine-readable JSON
- [ ] Exit code: 0 non-breaking, 1 breaking

**Dependencies:** B2.

**Track:** B · **Effort:** ~1.5 days" \
"track:cli"

create_issue "[B4] \`holonext validate\`" \
"**Context.** Standalone validator: checks Action definitions without emitting build artifacts.

**Acceptance criteria:**
- [ ] CLI subcommand \`holonext validate\`
- [ ] Reports invalid IDs, missing required fields, malformed JSON Logic, invalid JSON Schema
- [ ] Returns non-zero on failure
- [ ] Pretty-printed errors with file:line when possible

**Dependencies:** B1.

**Track:** B · **Effort:** ~1 day" \
"track:cli"

create_issue "[B5] \`holonext scaffold action <id>\`" \
"**Context.** Generate boilerplate ActionDefinition. Speeds up new-developer onboarding.

**Acceptance criteria:**
- [ ] Subcommand creates \`src/actions/<id>.ts\` with stub
- [ ] Asks for kind (mutation/query/human-delegated) interactively
- [ ] Output passes \`holonext validate\`

**Dependencies:** B1.

**Track:** B · **Effort:** ~0.5 day" \
"track:cli"

create_issue "[B6] TypeScript \`.d.ts\` emission" \
"**Context.** Generate strongly-typed client interfaces from Action definitions for cross-package usage.

**Acceptance criteria:**
- [ ] \`holonext build --emit-types\` produces \`dist/types/actions.d.ts\`
- [ ] Types include params, returns, error shapes per Action
- [ ] Generated file compiles in a separate project consuming it

**Dependencies:** A4 (generics), B2 (build).

**Track:** B · **Effort:** ~1.5 days" \
"track:cli"

# ---------------------------------------------------------------------------
# Track C — examples
# ---------------------------------------------------------------------------

create_issue "[C1] Polish cart example for v0.1" \
"**Context.** Cart is the smoke-test example. Tighten: error states, loading indicators, accessibility pass, README per example.

**Acceptance criteria:**
- [ ] Loading and error UI for every Action call
- [ ] Keyboard accessibility check
- [ ] Example-specific README with expected behaviour
- [ ] Compiles cleanly under runtime v0.1 API

**Dependencies:** A8 (API freeze).

**Track:** C · **Effort:** ~1 day" \
"track:examples"

create_issue "[C2] CRM contacts CRUD demo" \
"**Context.** Validates concurrent editing convention, partial success on bulk delete, query with filters/pagination.

**Acceptance criteria:**
- [ ] Actions: \`contact.list\` (query, paginated, searchable), \`contact.get\`, \`contact.create\`, \`contact.update\` with \`expected_version\`, \`contact.delete\`, \`contact.bulk_delete\` (partial success)
- [ ] In-memory store with simulated version conflicts
- [ ] UI: list view, edit drawer, bulk select
- [ ] Compiles under runtime v0.1 API
- [ ] Demoable through Claude Code via MCP bridge

**Dependencies:** A8.

**Track:** C · **Effort:** ~3 days" \
"track:examples"

create_issue "[C3] Dashboard read-heavy demo" \
"**Context.** Read-only sanity check. Validates spec works without bloat for query-only pages.

**Acceptance criteria:**
- [ ] Actions: \`dashboard.metrics\` (query, freshness=cached), \`dashboard.chart_sales_by_region\`, \`dashboard.set_filters\` (mutation), \`dashboard.export_csv\` (long-running with progress)
- [ ] Filter chips visibly bound to URL state
- [ ] Total Manifest size remains compact (≤2 KB) for read-only case
- [ ] Compiles under runtime v0.1 API

**Dependencies:** A8.

**Track:** C · **Effort:** ~2 days" \
"track:examples"

# ---------------------------------------------------------------------------
# Track D — documentation
# ---------------------------------------------------------------------------

create_issue "[D1] Quick-start guide (5-minute path)" \
"**Context.** Smallest possible path: install runtime, define one Action, hit it via curl. Zero MCP, zero CLI build.

**Acceptance criteria:**
- [ ] \`docs/quickstart.md\` with copy-pastable steps
- [ ] User reaches a working manifest+action in <5 min
- [ ] Reviewed by someone who has never seen the project

**Dependencies:** none (uses current API).

**Track:** D · **Effort:** ~0.5 day" \
"track:docs"

create_issue "[D2] Concepts & mental model doc" \
"**Context.** Explain Action, Manifest, kinds, transports, lifecycle. Foundation for all other docs.

**Acceptance criteria:**
- [ ] \`docs/concepts.md\` with diagrams for Action contract, event lifecycle, transports
- [ ] References to spec without duplicating it
- [ ] Each concept linked from the homepage / docs nav

**Dependencies:** none.

**Track:** D · **Effort:** ~1 day" \
"track:docs"

create_issue "[D3] API reference (auto-generated)" \
"**Context.** TypeDoc or equivalent generates reference docs from runtime / mcp-bridge / cli source.

**Acceptance criteria:**
- [ ] Tooling configured (TypeDoc / api-extractor)
- [ ] Output integrated into docs site
- [ ] CI fails if reference is out of date relative to code

**Dependencies:** A8 (frozen API), F3 (docs site infra).

**Track:** D · **Effort:** ~1 day" \
"track:docs"

create_issue "[D4] Recipes / common patterns" \
"**Context.** Cookbook: optimistic concurrency, partial success, long-running with progress, human-delegated handoff, query-with-filter, undo via inverse_action.

**Acceptance criteria:**
- [ ] At least 6 recipes, each with code snippet and explanation
- [ ] Reference real Actions from examples where possible

**Dependencies:** C2, C3 (most patterns demoed there).

**Track:** D · **Effort:** ~1 day" \
"track:docs"

create_issue "[D5] Migration guide for existing Hono / Express / Next.js apps" \
"**Context.** Show how to drop runtime middleware into an existing app without rewriting it.

**Acceptance criteria:**
- [ ] Hono integration walkthrough
- [ ] Express adapter snippet (or note limitation)
- [ ] Next.js route handlers snippet
- [ ] Each integrates with cart example without forking it

**Dependencies:** A8.

**Track:** D · **Effort:** ~1 day" \
"track:docs"

create_issue "[D6] Architecture diagrams" \
"**Context.** Visualise: data flow, transport map (WebMCP / stdio / HTTP), event lifecycle.

**Acceptance criteria:**
- [ ] At least 3 diagrams in \`docs/diagrams/\` (source + rendered SVG)
- [ ] Embedded in concepts.md and spec
- [ ] Style consistent across diagrams

**Dependencies:** D2.

**Track:** D · **Effort:** ~0.5 day" \
"track:docs"

# ---------------------------------------------------------------------------
# Track E — bridge
# ---------------------------------------------------------------------------

create_issue "[E1] Better error mapping (HTTP → MCP)" \
"**Context.** Bridge currently swallows non-200 responses into \`isError: true\` with raw text. Map to MCP-shaped error codes.

**Acceptance criteria:**
- [ ] HTTP 404 → MCP \`MethodNotFound\` semantics where applicable
- [ ] Action error codes from runtime preserved in tool result content
- [ ] Distinguishes transport errors (network, timeout) from action errors

**Dependencies:** A2.

**Track:** E · **Effort:** ~0.5 day" \
"track:bridge"

create_issue "[E2] SSE reconnection with backoff" \
"**Context.** Long bridge sessions can lose SSE on network blip. Add reconnect with exponential backoff and resume.

**Acceptance criteria:**
- [ ] On EventSource error / disconnect, retry with backoff (1s → 30s cap)
- [ ] Progress notifications still delivered after reconnect
- [ ] Tested under simulated server restart

**Dependencies:** none.

**Track:** E · **Effort:** ~0.5 day" \
"track:bridge"

create_issue "[E3] Multi-page bridge" \
"**Context.** Currently one bridge process serves one Manifest URL via env var. Allow runtime-switching the active page.

**Acceptance criteria:**
- [ ] Bridge accepts multiple page configurations on startup
- [ ] Tool name prefixed by page id when ambiguous
- [ ] Documented configuration format

**Dependencies:** none.

**Track:** E · **Effort:** ~1 day" \
"track:bridge"

create_issue "[E4] Manifest cache invalidation" \
"**Context.** Bridge fetches manifest on each \`tools/list\`. With \`manifest.updated\` event, can cache and invalidate.

**Acceptance criteria:**
- [ ] Bridge subscribes to \`manifest.updated\` event
- [ ] Caches manifest until invalidation
- [ ] \`tools/list\` returns cached or fresh as appropriate
- [ ] Tests cover invalidation flow

**Dependencies:** E2.

**Track:** E · **Effort:** ~0.5 day" \
"track:bridge"

create_issue "[E5] Bridge release prep (\`@holonext/mcp-bridge@0.1.0\`)" \
"**Context.** Final polish + version bump for the bridge package on npm.

**Acceptance criteria:**
- [ ] README in package documenting MCP integration
- [ ] CHANGELOG entry
- [ ] Versioned and ready to publish

**Dependencies:** E1, E2, E3, E4.

**Track:** E · **Effort:** ~0.3 day" \
"track:bridge"

# ---------------------------------------------------------------------------
# Track F — site & GTM
# ---------------------------------------------------------------------------

create_issue "[F1] Register \`holonext.dev\` (or chosen domain)" \
"**Context.** Manual external action. Cloudflare Registrar or Porkbun recommended. Naming may still change — buy after final decision.

**Acceptance criteria:**
- [ ] Domain registered (~\$10/year)
- [ ] DNS pointed at hosting (Cloudflare Pages / Vercel)

**Dependencies:** final naming decision.

**Track:** F · **Effort:** ~10 min" \
"track:site"

create_issue "[F2] Landing page" \
"**Context.** Single-page site: hero, value prop, demo gif, CTA to docs and GitHub.

**Acceptance criteria:**
- [ ] Live at the project domain
- [ ] Includes demo GIF/video showing Claude Code driving the cart
- [ ] Link to docs site, GitHub, npm

**Dependencies:** F1, F3, F5.

**Track:** F · **Effort:** ~1.5 days" \
"track:site"

create_issue "[F3] Docs site infrastructure" \
"**Context.** Astro Starlight or VitePress. Deployed on Cloudflare Pages.

**Acceptance criteria:**
- [ ] \`docs/\` content built into site
- [ ] Deployment automated on push to main
- [ ] Search works
- [ ] Versioned (so v0.2 docs don't overwrite v0.1)

**Dependencies:** F1, G3 (CI).

**Track:** F · **Effort:** ~2 days" \
"track:site"

create_issue "[F4] Launch blog post draft" \
"**Context.** Announce v0.1 release. Frame the problem (DOM scraping is brittle), the design (Action contracts), the proof (Claude Code demo).

**Acceptance criteria:**
- [ ] Draft in \`docs/posts/launch.md\` or external Substack
- [ ] Includes screenshots / GIF
- [ ] Reviewed for clarity by 1 outside reader

**Dependencies:** F5 (assets).

**Track:** F · **Effort:** ~0.5 day" \
"track:site"

create_issue "[F5] Demo GIF / video" \
"**Context.** 30-60s loop of Claude Code driving cart demo. Used in landing, blog, README.

**Acceptance criteria:**
- [ ] Captured as GIF (≤2 MB) and MP4 versions
- [ ] Shows: agent reading manifest, calling cart.add, progress notification, final state
- [ ] No personal info in frame

**Dependencies:** none (uses current proto).

**Track:** F · **Effort:** ~0.3 day" \
"track:site"

# ---------------------------------------------------------------------------
# Track G — infrastructure
# ---------------------------------------------------------------------------

create_issue "[G1] GitHub org decision (personal vs \`holonext\` org)" \
"**Context.** Repo currently under personal account. Transferring to an org now is cheap; later it's painful (broken refs, redirects, MCP registrations).

**Acceptance criteria:**
- [ ] Decision documented in \`docs/governance.md\`
- [ ] If transfer: org created, repo moved, all refs updated
- [ ] If staying: README states this explicitly

**Dependencies:** final naming decision.

**Track:** G · **Effort:** ~15 min" \
"track:infra"

create_issue "[G2] npm scope creation" \
"**Context.** Reserve \`@holonext\` (or chosen scope) on npmjs.com. Free for OSS.

**Acceptance criteria:**
- [ ] Scope reserved on npm
- [ ] Maintainer access set
- [ ] \`publishConfig\` set in each package

**Dependencies:** final naming decision.

**Track:** G · **Effort:** ~10 min" \
"track:infra"

create_issue "[G3] GitHub Actions CI (test on PR)" \
"**Context.** Run tests on every PR and push to main. Fail fast.

**Acceptance criteria:**
- [ ] Workflow at \`.github/workflows/ci.yml\`
- [ ] Bun matrix (latest stable)
- [ ] Runs \`bun test\` and \`bun run typecheck\`
- [ ] Status badge in README

**Dependencies:** A0.

**Track:** G · **Effort:** ~0.5 day" \
"track:infra"

create_issue "[G4] Release workflow (tag → npm publish)" \
"**Context.** On version tag, build and publish each package to npm.

**Acceptance criteria:**
- [ ] \`.github/workflows/release.yml\` triggers on \`v*\` tags
- [ ] \`NPM_TOKEN\` secret configured
- [ ] Publishes \`@holonext/runtime\`, \`@holonext/mcp-bridge\`, \`@holonext/cli\` only when version changed
- [ ] Generates GitHub Release with CHANGELOG content

**Dependencies:** G2, G3, A8.

**Track:** G · **Effort:** ~1 day" \
"track:infra"

create_issue "[G5] CONTRIBUTING.md" \
"**Context.** Standard contribution guide: fork, branch naming, conventional commits, test expectations, code-of-conduct link.

**Acceptance criteria:**
- [ ] \`CONTRIBUTING.md\` at repo root
- [ ] Linked from README
- [ ] Includes development setup snippet

**Dependencies:** none.

**Track:** G · **Effort:** ~0.3 day" \
"track:infra"

create_issue "[G6] Issue and PR templates" \
"**Context.** Templates for bug, feature, RFC. PR template with checklist.

**Acceptance criteria:**
- [ ] \`.github/ISSUE_TEMPLATE/*.md\`: bug, feature, rfc
- [ ] \`.github/PULL_REQUEST_TEMPLATE.md\` with linked-issue and tests checklist

**Dependencies:** none.

**Track:** G · **Effort:** ~0.3 day" \
"track:infra"

# ---------------------------------------------------------------------------
# Track H — spec evolution
# ---------------------------------------------------------------------------

create_issue "[H1] Resolve open spec questions for 0.1.0" \
"**Context.** Spec lists 6 open questions: Manifest caching, scope naming, JSON Logic evaluator choice, WebMCP permission model, Action versioning, OT for concurrent agents. Triage: which must be resolved for 0.1.0 freeze, which deferred to v0.2.

**Acceptance criteria:**
- [ ] Each open question annotated: resolved / deferred-to-v0.2 / deferred-to-v0.3
- [ ] For 'resolved', spec updated with decision
- [ ] For 'deferred', linked to a tracking issue

**Dependencies:** none.

**Track:** H · **Effort:** ~1 day" \
"track:spec"

create_issue "[H2] Spec freeze ceremony — 0.1.0" \
"**Context.** Snapshot \`spec-mvp.md\` as \`spec-0.1.0.md\` (immutable). Future changes go to \`spec-0.2.0-draft.md\`.

**Acceptance criteria:**
- [ ] \`spec-0.1.0.md\` created, marked immutable in front-matter
- [ ] CHANGELOG records freeze date
- [ ] All references in code / docs link to versioned spec

**Dependencies:** H1.

**Track:** H · **Effort:** ~0.3 day · **Type:** milestone" \
"track:spec,critical-path"

create_issue "[H3] Versioning policy doc" \
"**Context.** Define how Action / runtime / spec versions interact, and what counts as breaking.

**Acceptance criteria:**
- [ ] \`docs/versioning.md\` covers semver per package, spec version, Action versioning conventions
- [ ] Examples of breaking and non-breaking changes
- [ ] Linked from CONTRIBUTING.md

**Dependencies:** H2.

**Track:** H · **Effort:** ~0.5 day" \
"track:spec"

create_issue "[H4] Reference compatibility test suite" \
"**Context.** Black-box tests that any spec-conformant implementation must pass. Useful both for our reference and any third-party implementer.

**Acceptance criteria:**
- [ ] \`packages/spec-tests\` with curl-based or HTTP-client tests against a \`/.well-known/agent-manifest.json\` endpoint
- [ ] Covers each ActionEvent type, kind semantics, RFC 6902 patches, partial success, progress
- [ ] Runs against cart example in CI

**Dependencies:** A8, H2.

**Track:** H · **Effort:** ~1.5 days" \
"track:spec"

echo
echo "==> All done."
