# Agent-Friendly Web Framework — Research Summary

> Дата: 2026-05-06

## Summary простору

Індустрія сходиться на тому що DOM-scraping + screenshot vision — тимчасовий хак.
VisualWebArena: найкращі VLM-агенти ~16% success rate проти 88% у людей.
У вересні 2025 Google/Microsoft/Amazon конвергували навколо **WebMCP** (W3C Community Group).
Chrome early preview — лютий 2026.

Є 4 шари, які ніхто ще не з'єднав:
- **Discovery**: llms.txt (read-only)
- **Action contracts**: agents.json, WebMCP, Apple App Intents
- **UI-state streaming**: AG-UI / CopilotKit
- **DOM grounding**: Playwright ARIA snapshots, Stagehand caching

## Ключові прогалини

1. Discovery + action contracts + state observability **разом** в одному форматі — не існує.
2. Structured event stream про результат дії (агенти зараз poll-ять DOM).
3. Optimistic vs final state у SPA — немає протоколу.
4. Ідемпотентність / replay-safety для caching — немає стандарту.
5. `requires_confirmation`, `irreversible`, `sensitive_data` — вирішується ad-hoc.
6. Stable semantic IDs, що переживають refactor і i18n — немає.

## 8 архітектурних принципів

1. **Action-first** (App Intents-style): компонент декларує verbs, не "тут є кнопка".
2. **Dual-layer addressing**: `product.add-to-cart` + fallback на ARIA role+name.
3. **State as observable contract**: lifecycle events (`action.started`, `action.succeeded`, `state.changed`).
4. **Schema-validated params з prompt hints**: JSON Schema + NL descriptions.
5. **Cacheable, replayable actions**: маркувати ідемпотентність і deterministic params.
6. **WebMCP як transport**: `navigator.modelContext`, не власний wire protocol.
7. **Permission/safety annotations**: `requires_confirmation`, `irreversible`, `sensitive_data`.
8. **Progressive disclosure**: мінімальний manifest для discovery, деталі — on-demand.

## Anti-patterns

- CSS/XPath у контрактах
- Pure vision як основний механізм
- Synchronous req/resp без event streaming
- Rebranded ARIA (overloading semantics)
- Vendor-specific JSON форматів
- Stateful protocol без replay
- Hidden imperative-only actions
- Прив'язка до chat UI shape

## Джерела

- WebMCP W3C: https://github.com/webmachinelearning/webmcp
- AG-UI Protocol: https://github.com/ag-ui-protocol/ag-ui
- agents.json: https://github.com/wild-card-ai/agents-json
- Stagehand: https://github.com/browserbase/stagehand
- VisualWebArena: https://jykoh.com/vwa
- SeeAct (ICML'24): https://github.com/OSU-NLP-Group/SeeAct
- Apple App Intents: https://developer.apple.com/documentation/appintents
