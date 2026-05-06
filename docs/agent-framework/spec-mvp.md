# HoloNext Agent Framework — MVP Specification

> Версія: 0.1.0-draft  
> Дата: 2026-05-06  
> Статус: чернетка для обговорення

---

## Зафіксовані рішення (2026-05-06)

| # | Питання | Рішення | Наслідок |
|---|---|---|---|
| 1 | Transport | **WebMCP primary, HTTP fallback** | MVP де-факто Chromium-targeted (Chrome early preview лютий 2026) |
| 2 | Event stream | **WebTransport / HTTP/3 streams** | Bet на майбутнє, послідовно з WebMCP-first |
| 3 | Preconditions | **JSON Logic** | Повна виразність, потребує evaluator |
| 4 | Tooling | **Гібрид: runtime + CLI build-time** з MVP | Більший scope, але production-grade одразу |
| 5 | Multi-step flows | **Lightweight DAG у Manifest** | Покриває linear flows як checkout; складна orchestration — v0.2 |
| 6 | Action kinds | **mutation / query / human-delegated** | Categorical fix: queries і PCI/SSO hand-off тепер first-class |
| 7 | Long-running actions | **`action.progress` events + `long_running` flag** | Exports, bulk operations, async jobs мають прогрес у MVP |
| 8 | Partial success | **`action.partially_succeeded` event у MVP** | Bulk operations потребують per-item статус; punt у v0.2 був помилкою |
| 9 | Concurrent editing | **Convention: `expected_version` + `VERSION_CONFLICT`** | Optimistic concurrency як рекомендована конвенція, не примус. Тільки для persistent entities. |
| 10 | Data freshness | **`freshness.policy` + `as_of` у returns** | Агент знає live vs cached vs snapshot |
| 11 | Sortable collections | **`sortable_fields` у query Action** | Симетрично до `searchable_fields` |
| 12 | Scope boundary | **Action-rich pages only; content → llms.txt** | Чітке розмежування з Schema.org / llms.txt |

---

## Мета

Фреймворк для веб-сторінок, де AI-агенти можуть:
- **Знаходити** доступні дії без парсингу DOM / screenshot-у
- **Виконувати** дії з типобезпечним контрактом (параметри, preconditions, postconditions)
- **Спостерігати** результат — structured event stream, не polling
- **Відновлювати** роботу після перезавантаження — replay-safe actions

Люди-розробники можуть впроваджувати фреймворк **декларативно** (HTML-атрибути) або **програмно** (JS API), з мінімальним оверхедом.

## Scope

HoloNext Agent Framework призначений для **action-rich interactive pages** — checkout, CRM, dashboards, форми, апплікаційні UI. Для **content-only** сторінок (landing, статті, документація) фреймворк не приносить вартості — їх рекомендовано supplement-увати [`llms.txt`](https://llmstxt.org/) як baseline для read-only discovery.

Фреймворк не намагається замінити llms.txt чи Schema.org — це додатковий шар над ними для interactivity.

---

## Ключові концепції

| Концепція | Що це |
|---|---|
| **Action** | Одиниця взаємодії. Verb + params + contract. Аналог Apple App Intent. |
| **Component** | HTML-елемент або група елементів, що реєструє одну або більше Actions. |
| **Manifest** | Сторінковий JSON-документ — список всіх доступних Actions прямо зараз. |
| **ActionEvent** | Подія про стан виконання Action, доставляється через WebTransport stream (SSE — fallback). |
| **Semantic ID** | Стабільний ідентифікатор Action у форматі `scope.verb[.qualifier]`. |

---

## 1. Semantic ID

Формат: `<scope>.<verb>[.<qualifier>]`

```
cart.add
cart.remove
checkout.submit
product.view
user.login
search.execute
modal.close
form.password-reset.submit
```

**Правила:**
- Тільки `[a-z0-9-]`, крапка як роздільник рівнів
- Scope = домен (cart, user, search, ...) або ім'я компонента
- Verb = дія (add, remove, submit, open, close, ...)
- Qualifier — опціонально, для розрізнення кількох форм одного verb

**Стабільність:** ID не змінюється при рефакторингу HTML, перейменуванні CSS-класів, i18n.

### 1.1 Норма: prefer entity-ID actions over DOM-positional

Dual-layer addressing (semantic ID + ARIA fallback) працює **тільки коли елемент у DOM**.
Для virtualized lists, paginated tables, lazy-loaded даних — ARIA fallback **не діє** (елементу не існує до scroll-у).

Тому правило:
- Mutation Actions на конкретну сутність **зобов'язані** приймати `entity_id` як param (`contact.update({ id, ... })`), не покладатись на DOM-position.
- Query Actions на колекції **повинні** експонувати `searchable_fields` — щоб агент шукав через filter, а не скрол.

ARIA fallback — **виключно для visible UI affordances** (кнопки на поточному viewport-і).

### 1.2 Норма: visualizations expose data via query Action

Чарти, KPI tiles, графи, heatmaps — це візуалізації. Агент не «бачить» їх піксельно (це поза scope spec).
**Кожна візуалізація MUST мати query Action**, що повертає підлеглі дані з тими самими (або еквівалентними) params, що й сам візуал.

Приклад: KPI tile «Revenue this quarter» = query Action `dashboard.metric_revenue` з params `{ period: "quarter" }`.
Чарт «Sales by region» = query Action `dashboard.chart_sales_by_region` з тими ж filter params.

Без цього 70%+ дашборда залишається невидимим для агента.

---

## 2. Action Definition

Кожна Action описується JSON-об'єктом:

```jsonc
{
  // Ідентифікація
  "id": "cart.add",
  "kind": "mutation",                    // "mutation" | "query" | "human-delegated"
  "label": "Add item to cart",           // NL-підказка для LLM
  "description": "Adds a product to the shopping cart by SKU and quantity.",

  // Параметри — JSON Schema Draft 7
  "params": {
    "type": "object",
    "required": ["sku"],
    "properties": {
      "sku": {
        "type": "string",
        "description": "Product SKU identifier"
      },
      "quantity": {
        "type": "integer",
        "minimum": 1,
        "default": 1,
        "description": "How many units to add"
      }
    }
  },

  // Безпека та поведінка
  "safety": {
    "idempotent": false,          // чи безпечно повторити
    "reversible": true,           // чи можна скасувати
    "requires_confirmation": false,
    "sensitive_data": false,
    "inverse_action": "cart.remove"  // опціонально — Action ID, що скасовує цю
  },

  // Поведінка виконання
  "behavior": {
    "long_running": false,           // якщо true — очікувати action.progress events
    "estimated_duration_ms": 200,    // підказка для агента
    "supports_partial": false        // якщо true — може емітити action.partially_succeeded
  },

  // Preconditions — JSON Logic (повний вираз)
  "preconditions": {
    "and": [
      { "==": [{ "var": "user_authenticated" }, true] },
      { ">":  [{ "var": "stock_count" }, 0] },
      { "<":  [{ "var": "cart_item_count" }, 50] }
    ]
  },

  // DOM-прив'язка (опціонально, для hybrid grounding)
  "element": {
    "aria_role": "button",
    "aria_label": "Add to cart",
    "selector_hint": "[data-action='cart.add']"  // тільки hint, не контракт
  },

  // Очікуваний результат
  "postconditions": {
    "description": "Item appears in cart, cart count increments"
  }
}
```

### 2.1 Action Kinds

| Kind | Семантика | Returns | State change | Idempotent |
|---|---|---|---|---|
| **mutation** | Змінює state. Default. | Optional | Так, емітить `state.changed` | Тільки якщо `safety.idempotent: true` |
| **query** | Читає дані без побічних ефектів. | **Required** (`returns` schema) | Ні | Завжди (за визначенням) |
| **human-delegated** | Агент не виконує сам — UI веде користувача. | Optional | Так, після завершення user-ом | N/A |

### 2.2 Query Action — приклад

```jsonc
{
  "id": "contact.list",
  "kind": "query",
  "label": "List contacts",
  "description": "Returns a filtered, paginated list of contacts.",
  "params": {
    "type": "object",
    "properties": {
      "status":  {
        "type": "string",
        "enum": ["active", "archived", "deleted"],
        "default": { "$state": "current_filters.status" }   // підтягує дефолт зі state
      },
      "owner_id": { "type": "string" },
      "search":   { "type": "string", "description": "Free-text search" },
      "limit":    { "type": "integer", "default": 50 },
      "offset":   { "type": "integer", "default": 0 }
    }
  },
  "returns": {
    "type": "object",
    "properties": {
      "items":   { "type": "array", "items": { "$ref": "#/definitions/Contact" } },
      "total":   { "type": "integer" },
      "version": { "type": "string", "description": "ETag of the list snapshot" },
      "as_of":   { "type": "string", "format": "date-time", "description": "When the data was computed" }
    }
  },
  // Поля, за якими агент може ефективно шукати замість скролу
  "searchable_fields": ["name", "email", "company", "phone"],
  "sortable_fields":   ["name", "created_at", "last_activity_at"],
  // Свіжість даних
  "freshness": {
    "policy": "cached",            // "live" | "cached" | "snapshot"
    "cache_ttl_seconds": 60        // опціонально, для cached
  },
  "safety": { "idempotent": true, "reversible": true }
}
```

#### `$state` reference

Параметр може отримати default зі state Manifest-у через `{ "$state": "<json-pointer-like-path>" }`.
Це дає очевидну дефолтну поведінку («використовуй те, що зараз бачить юзер») і явну можливість override-у.

**Працює для усіх Action kind-ів** (mutation, query, human-delegated) — не тільки query. Класичний приклад: `dashboard.export_csv` бере фільтри з `$state.current_filters` за замовчуванням.

#### Freshness policy

| `policy` | Семантика | Агент має робити |
|---|---|---|
| `live` | Real-time (push або < 1s polling) | Довіряти |
| `cached` | Backend cache, TTL з `cache_ttl_seconds` | Якщо потрібна свіжість — викликати з reserved param `_bypass_cache: true` або чекати TTL |
| `snapshot` | Batch / daily | Не покладатись для real-time decisions |

**Reserved params** (всі з префіксом `_`): зарезервовані фреймворком, агент може передавати у будь-якому виклику, сервер MUST приймати без declaration:
- `_bypass_cache: boolean` — для query Action з `freshness.policy: "cached"`. Якщо true — пропустити cache, повернути fresh data.
- `_invocation_id: string` — переписати invocation ID, що генерує агент (для idempotency keys).

Майбутні reserved params додаватимуться у наступних версіях spec.

### 2.3 Human-Delegated Action — приклад

```jsonc
{
  "id": "checkout.set_payment_method",
  "kind": "human-delegated",
  "label": "Enter payment details",
  "description": "User must enter card details via Stripe Elements iframe.",
  // Params порожні — агент не передає raw card data
  "params": { "type": "object", "properties": {} },
  "safety": {
    "idempotent": false,
    "reversible": true,
    "sensitive_data": true,
    "requires_human_input": true,
    "human_input_reason": "PCI: card data must be entered in Stripe iframe (different origin)",
    "human_input_target": "[data-stripe-elements='card']"  // де UI підсвітити
  }
}
```

**Поведінка агента** при виклику human-delegated action:
1. Агент викликає action з порожніми params (або частковими, якщо такі є)
2. Сервер емітить `action.awaiting_human` з `reason` і `target` selector
3. Фреймворк фокусує/підсвічує цільовий widget у UI
4. Агент **зупиняється** і повідомляє користувача: "Please enter card details — I cannot do this for you (PCI)"
5. Користувач завершує — сервер емітить `action.succeeded`
6. Агент продовжує flow

**Норма: safety прапори для human-delegated.** `idempotent` і `reversible` для цього kind описують **ефект на стан після завершення user-ом**, не відповідальність агента (агент не виконує). `requires_confirmation` ігнорується (юзер сам у control). `requires_human_input` для цього kind — implicit `true` навіть якщо не вказано явно.

---

## 3. Page Manifest

Доступний за: `GET /.well-known/agent-manifest.json`  
Або вбудований у сторінку: `<script type="application/agent-manifest+json">`

```jsonc
{
  "$schema": "https://holonext.dev/schemas/agent-manifest/0.1.0",
  "version": "0.1.0",
  "page": {
    "url": "https://example.com/product/123",
    "title": "iPhone 16 Pro — Apple Store",
    "context": "Product detail page. User is browsing a specific product."
  },
  "actions": [
    // Повні Action Definitions inline АБО
    // зовнішні посилання для progressive disclosure.
    // `$ref` тут — URL до окремого Action Definition document-у
    // (НЕ JSON Pointer у JSON Schema розумінні).
    // Може бути absolute або relative до origin Manifest-у.
    { "$ref": "/api/agent/actions/cart.add" },
    { "$ref": "/api/agent/actions/cart.remove" },
    { "$ref": "/api/agent/actions/checkout.submit" }
  ],
  "state": {
    // Поточний спостерігальний стан (мінімальний).
    // Включає URL query params, якщо вони є частиною observable state.
    // Mutations, що змінюють filter/sort/pagination, повинні оновлювати URL —
    // shareable links і browser history work as expected.
    "cart_item_count": 2,
    "user_authenticated": true,
    "current_product_sku": "IPHONE-16-PRO-256-BLACK",
    "current_filters": { "status": "active", "region": "EU" },  // приклад URL-derived state
    "current_url": "https://example.com/contacts?status=active&region=EU"
  },
  // Опціональний опис багатокрокових процесів (lightweight graph, не orchestration engine)
  "flows": [
    {
      "id": "checkout",
      "label": "Standard checkout",
      "steps": [
        { "action": "checkout.start", "depends_on": [] },
        { "action": "checkout.set_shipping_address", "depends_on": ["checkout.start"] },
        { "action": "checkout.select_shipping_method", "depends_on": ["checkout.set_shipping_address"] },
        { "action": "checkout.set_payment_method", "depends_on": ["checkout.select_shipping_method"] },
        { "action": "checkout.place_order", "depends_on": ["checkout.set_payment_method"] }
      ],
      "current_step": "checkout.set_shipping_address",  // null якщо flow не розпочатий
      "completed_steps": ["checkout.start"]
    }
  ],
  // Транспорт для подій
  "events_endpoint": "/api/agent/events",  // WebTransport / HTTP/3 streams (SSE fallback)
  "mcp_endpoint": "/api/agent/mcp"         // WebMCP transport
}
```

---

## 4. Action Execution

> **Browser support reality:** WebMCP — Chromium-only (early preview, лютий 2026). MVP де-факто Chromium-targeted. HTTP fallback покриває server-side агентів і non-Chromium браузери.

### 4.1 Primary: WebMCP

```javascript
// Агент отримує доступ через browser-native API
const ctx = await navigator.modelContext.request({ origin: "https://example.com" });
const tools = await ctx.listTools();
// tools містить cart.add, checkout.submit тощо

const result = await ctx.callTool("cart.add", { sku: "IPHONE-16-PRO", quantity: 1 });
```

WebMCP transport обов'язковий: фреймворк реєструє всі Actions через `navigator.modelContext.registerTool()` під час bootstrap.

### 4.2 Fallback: HTTP + JSON

Для server-side агентів і браузерів без WebMCP. Семантично еквівалентно — той самий Action ID, та сама params schema.

```http
POST /api/agent/actions/cart.add
Content-Type: application/json
X-Agent-Session: <session-id>

{
  "sku": "IPHONE-16-PRO-256-BLACK",
  "quantity": 1
}
```

### 4.3 Декларативний (HTML, zero-JS)

```html
<button
  data-agent-action="cart.add"
  data-agent-params='{"sku": "IPHONE-16-PRO"}'
  data-agent-idempotent="false"
  data-agent-reversible="true"
>
  Add to Cart
</button>
```

Фреймворк автоматично реєструє цю кнопку у Manifest і обробляє виклик.

---

## 5. ActionEvent — Lifecycle Events

Агент підписується через **WebTransport / HTTP/3 streams** (`events_endpoint`).
HTTP fallback: SSE на тому ж URL, якщо browser не підтримує WebTransport.

> **Browser support reality:** WebTransport — Chromium/Edge only станом на 2026-05. Послідовно з WebMCP-first позицією: один Chrome-first stack для primary, fallback для решти.

### Типи подій

```typescript
type ActionEventType =
  | "action.started"
  | "action.progress"               // long-running action: percent / stage / partial result
  | "action.succeeded"
  | "action.partially_succeeded"    // bulk: частина items вдалась, частина — ні
  | "action.failed"
  | "action.requires_confirmation"  // агент має зупинитися і запитати юзера (post-fact confirm)
  | "action.awaiting_human"         // human-delegated — UI веде юзера, агент чекає
  | "state.changed"                 // patches: RFC 6902 (JSON Patch)
  | "page.navigated"
  | "flow.step_changed"             // current_step у flow змінився
  | "manifest.updated";             // Manifest змінився — перечитати
```

**Common envelope** (всі події):

```typescript
interface ActionEvent {
  type: ActionEventType;
  timestamp: string;        // ISO-8601
  action_id?: string;       // для action.* events
  invocation_id?: string;   // унікальний ID конкретного виклику
  // type-specific fields…
}
```

### Базові приклади

#### `action.succeeded`

```jsonc
{
  "type": "action.succeeded",
  "action_id": "cart.add",
  "invocation_id": "inv-1a2b",
  "timestamp": "2026-05-06T10:00:00.000Z",
  "result": {
    "added_sku": "IPHONE-16-PRO-256-BLACK"
  },
  // Опціональні підказки агенту, що логічно робити далі — ID-references на доступні Actions.
  // НЕ обов'язкові; агент не повинен сліпо їм слідувати.
  "next_suggested_actions": ["checkout.start", "cart.view"]
}
```

#### `action.failed`

```jsonc
{
  "type": "action.failed",
  "action_id": "cart.add",
  "invocation_id": "inv-1a2b",
  "timestamp": "2026-05-06T10:00:01.000Z",
  "error": {
    "code": "OUT_OF_STOCK",
    "message": "Product is no longer available",
    "recoverable": false,
    "suggested_action": null
  }
}
```

#### `state.changed` (RFC 6902 JSON Patch)

```jsonc
{
  "type": "state.changed",
  "timestamp": "2026-05-06T10:00:02.000Z",
  "patches": [
    { "op": "replace", "path": "/cart_item_count", "value": 3 },
    { "op": "add",     "path": "/last_added_sku", "value": "IPHONE-16-PRO-256-BLACK" }
  ]
}
```

State patches **MUST** використовувати [RFC 6902 JSON Patch](https://datatracker.ietf.org/doc/html/rfc6902) формат. Підтримувані операції: `add`, `remove`, `replace`, `move`, `copy`, `test`. Operational transform для concurrent agents — поза scope MVP.

### Спеціалізовані приклади

### Приклад `action.awaiting_human`

```jsonc
{
  "type": "action.awaiting_human",
  "action_id": "checkout.set_payment_method",
  "invocation_id": "inv-9f8a",
  "timestamp": "2026-05-06T10:05:00.000Z",
  "human_input_reason": "PCI: card data must be entered in Stripe iframe",
  "human_input_target": "[data-stripe-elements='card']",
  "agent_instruction": "Inform the user, then wait for action.succeeded or action.failed"
}
```

### Приклад `action.progress` (long-running)

```jsonc
{
  "type": "action.progress",
  "action_id": "contact.export",
  "invocation_id": "inv-3d2e",
  "timestamp": "2026-05-06T10:10:15.000Z",
  "percent": 47,
  "stage": "writing-csv",
  "message": "Exported 47000 of 100000 contacts",
  "partial_result": null               // опціонально: проміжний результат
}
```

### Приклад `action.partially_succeeded` (bulk)

```jsonc
{
  "type": "action.partially_succeeded",
  "action_id": "contact.bulk_delete",
  "invocation_id": "inv-7c1b",
  "timestamp": "2026-05-06T10:11:00.000Z",
  "succeeded_items": ["contact-001", "contact-002", "contact-003"],
  "failed_items": [
    { "id": "contact-004", "error": { "code": "PERMISSION_DENIED", "message": "Insufficient privileges" } },
    { "id": "contact-005", "error": { "code": "ENTITY_LOCKED", "message": "Currently being edited" } }
  ],
  "summary": { "total": 5, "succeeded": 3, "failed": 2 }
}
```

### Приклад `action.failed` з VERSION_CONFLICT

```jsonc
{
  "type": "action.failed",
  "action_id": "contact.update",
  "invocation_id": "inv-2a4f",
  "timestamp": "2026-05-06T10:12:00.000Z",
  "error": {
    "code": "VERSION_CONFLICT",
    "message": "Contact was modified by another user",
    "recoverable": true,
    "current_version": "v42",
    "your_version": "v40",
    "suggested_action": "contact.get"   // прочитати свіжу версію і retry
  }
}
```

### 5.1 Норма: state — server-confirmed truth

`state` у Manifest **завжди** відображає підтверджений сервером стан. Optimistic UI (миттєвий рендер до підтвердження) — local rendering concern і **агенту не expose-иться**. Агент довіряє state і event stream, не DOM.

---

## 6. Реєстрація Actions (JS API)

```typescript
import { defineAction, registerComponent } from "@holonext/agent";

const addToCart = defineAction({
  id: "cart.add",
  kind: "mutation",
  label: "Add item to cart",
  description: "Adds a product to the shopping cart.",
  params: {
    type: "object",
    required: ["sku"],
    properties: {
      sku:      { type: "string", description: "Product SKU" },
      quantity: { type: "integer", minimum: 1, default: 1 }
    }
  },
  safety: {
    idempotent: false,
    reversible: true,
    inverse_action: "cart.remove"
  },
  behavior: {
    long_running: false,
    estimated_duration_ms: 200,
    supports_partial: false
  },
  preconditions: {
    "and": [
      { "==": [{ "var": "user_authenticated" }, true] },
      { ">":  [{ "var": "stock_count" }, 0] }
    ]
  },
  async perform(params, context) {
    // context API:
    //   context.emit(eventType, payload)        — емітить ActionEvent
    //   context.state                           — read-only snapshot of state
    //   context.invocation_id                   — поточний invocation ID
    //   context.signal                          — AbortSignal для cancellation (v0.2)
    const result = await fetch("/api/cart/items", { method: "POST", body: JSON.stringify(params) });
    return await result.json();
    // Фреймворк автоматично емітить action.started перед perform і
    // action.succeeded після successful return.
  }
});

const exportContacts = defineAction({
  id: "contact.export",
  kind: "mutation",
  label: "Export contacts to CSV",
  params: { type: "object", properties: { filters: { type: "object" } } },
  safety: { idempotent: true, reversible: true, sensitive_data: true },
  behavior: { long_running: true, estimated_duration_ms: 30000, supports_partial: true },
  async perform(params, context) {
    const total = await countContacts(params.filters);
    let processed = 0;
    for await (const batch of streamContacts(params.filters)) {
      await writeBatch(batch);
      processed += batch.length;
      context.emit("action.progress", {
        percent: Math.round((processed / total) * 100),
        stage: "writing-csv",
        message: `Exported ${processed} of ${total} contacts`
      });
    }
    return { download_url: "/exports/abc123.csv" };
  }
});

// Прив'язка до компонента (React, Vue, Vanilla — не важливо)
registerComponent(document.querySelector("#add-to-cart-btn"), [addToCart]);
```

---

## 7. Discovery Flow (як агент знаходить дії)

```
1. GET /.well-known/agent-manifest.json
   → отримує список action $refs + поточний стан + endpoints

2. GET /api/agent/actions/{id}  (для кожної потрібної дії)
   → отримує повну Action Definition з params schema

3. Primary: navigator.modelContext.request() — WebMCP сесія
   Fallback: підписка на events_endpoint через WebTransport (або SSE)

4. Викликає дії через WebMCP `callTool()` або HTTP POST /api/agent/actions/{id}
   → чекає на action.succeeded / action.failed / action.progress подію
   → НЕ poll DOM, НЕ poll endpoint
```

**Progressive disclosure:** агент завантажує тільки ті Actions, які йому потрібні — не весь Manifest одразу.

---

## 7a. Concurrent Editing — рекомендована конвенція

**Scope:** конвенція стосується **persistent entities** (CRM contacts, документи, налаштування, замовлення). Для **ephemeral UI state** (filters, sort order, viewport, pagination, drawer open/close) version token надмірний — last-write-wins прийнятний і простіший.

Як розрізнити: persistent entity має server-side ідентичність і lifecycle, переживає reload сторінки. Ephemeral state — лише render concern, скидається з сесією.

Для persistent entities spec **рекомендує** (не примушує) optimistic concurrency через version token.

### Конвенція

1. **Query** Action на сутність повертає `version` поле (ETag-style: `"v42"` або `"2026-05-06T10:00:00Z"`).
2. **Mutation** Action на ту саму сутність приймає `expected_version` як обов'язковий param.
3. Якщо `expected_version` не збігається з поточним — сервер відповідає `action.failed` з кодом **`VERSION_CONFLICT`** і поверненням `current_version`, `your_version`.
4. Агент має retry policy: `contact.get` → отримати свіжу версію → merge → `contact.update` з новим `expected_version`.

### Приклад

```jsonc
// Query
{ "id": "contact.get", "kind": "query", "returns": { "properties": { "version": { "type": "string" }, "...": "..." } } }

// Mutation
{
  "id": "contact.update",
  "params": {
    "type": "object",
    "required": ["id", "expected_version"],
    "properties": {
      "id":               { "type": "string" },
      "expected_version": { "type": "string" },
      "fields":           { "type": "object" }
    }
  }
}
```

Spec **не нав'язує** ETag формат, зберігання версій, чи семантику merge — це залишається імплементації. Spec тільки фіксує:
протокольний контракт між агентом і сайтом для concurrent editing випадків.

---

## 8. Safety Model

| Властивість | Значення | Поведінка агента |
|---|---|---|
| `idempotent: true` | Безпечно повторити | Може retry без питань |
| `idempotent: false` | Побічні ефекти | Не retry автоматично |
| `reversible: false` | Незворотна дія | Показати warning user-у |
| `reversible: true` + `inverse_action: "X"` | Зворотна, з відомим способом скасувати | Може запропонувати undo через дію X |
| **Норма** про `inverse_action` | **Однонаправлене** посилання, не симетричне. `cart.add → cart.remove` НЕ означає `cart.remove → cart.add` автоматично — кожна action декларує власний inverse явно. Params між парою НЕ повинні збігатись (типовий приклад: `delete(id)` ↔ `restore(id, snapshot)`). |
| `requires_confirmation: true` | Потребує підтвердження | **Зупинитися, запитати user-а** |
| `requires_human_input: true` | Не може виконати сам | Hand-off — показати UI юзеру, чекати completion |
| `sensitive_data: true` | Містить чутливі дані | Не логувати params, не кешувати |

---

## 9. HTML-атрибути (повний набір)

```html
<!-- Мінімум -->
<button data-agent-action="cart.add">Add to cart</button>

<!-- Повний набір (mutation) -->
<button
  data-agent-action="cart.add"
  data-agent-kind="mutation"
  data-agent-params='{"sku": "SKU-123"}'
  data-agent-label="Add iPhone to cart"
  data-agent-idempotent="false"
  data-agent-reversible="true"
  data-agent-inverse-action="cart.remove"
  data-agent-requires-confirmation="false"
  data-agent-sensitive="false"
  data-agent-long-running="false"
  data-agent-supports-partial="false"
  data-agent-preconditions='{"and":[
    {"==":[{"var":"user_authenticated"},true]},
    {">":[{"var":"stock_count"},0]}
  ]}'
>
  Add to Cart
</button>

<!-- Human-delegated -->
<div
  data-agent-action="checkout.set_payment_method"
  data-agent-kind="human-delegated"
  data-agent-requires-human-input="true"
  data-agent-human-input-reason="PCI: card data must be entered in Stripe iframe"
  data-agent-human-input-target="[data-stripe-elements='card']"
  data-agent-sensitive="true"
></div>

<!-- Стан компонента (observable, додається у Manifest.state) -->
<div
  data-agent-state="cart"
  data-agent-state-value='{"item_count": 2, "total": 199.99}'
>
  Cart (2)
</div>
```

**Норма:** `data-agent-preconditions` приймає **тільки JSON Logic вираз** (рішення #3). Простий key-value формат не підтримується — конвертуйте у JSON Logic.

---

## 10. Tooling — Hybrid (Runtime + CLI Build-Time)

MVP включає обидва шляхи. Той самий API визначення Action працює в обох — різниця у runtime-і.

### 10.1 Dev mode — runtime-генерація

```javascript
// Сервер при старті збирає всі defineAction у пам'ять
import { createAgentMiddleware } from "@holonext/agent/runtime";

app.use(createAgentMiddleware({ actions: [addToCart, removeFromCart, checkout] }));
// Експонує:
//   GET  /.well-known/agent-manifest.json
//   GET  /api/agent/actions/:id
//   POST /api/agent/actions/:id
//   GET  /api/agent/events  (WebTransport + SSE fallback)
```

- Hot reload працює: зміна в Action одразу відбивається у Manifest
- Динамічна реєстрація: feature flags, A/B-тести, per-tenant Actions

### 10.2 Production build — CLI

```bash
holonext build
```

Команда:
1. Збирає всі `defineAction` зі стандартних entry points (`src/actions/**/*.{ts,js}`)
2. Валідує JSON Schema-и (params), JSON Logic-вирази (preconditions)
3. Перевіряє унікальність `id` у межах scope
4. Генерує:
   - `dist/agent-manifest.json` — статичний Manifest, immutable, CDN-friendly
   - `dist/actions/<id>.json` — окремі ActionDefinition-и
   - `dist/types/actions.d.ts` — TypeScript-типи для params/results
5. Якщо є `dist/agent-manifest.previous.json` — emit-ить **manifest diff** (breaking change detection)

```bash
holonext diff
# Виводить changes:
# - REMOVED action: cart.bulk-add (BREAKING)
# - CHANGED params schema: checkout.submit (added required field "tos_accepted") (BREAKING)
# - ADDED action: wishlist.add (NON-BREAKING)
```

### 10.3 Інші CLI-команди

```bash
holonext scaffold action cart.remove   # генерує boilerplate ActionDefinition
holonext validate                       # тільки валідація без emit
holonext serve                          # standalone dev server для тестування
```

---

## 11. Що НЕ входить у MVP

- Авторизація агентів (auth між агентом і сайтом) — v0.2
- **Powerful** flow orchestration (conditional branches, loops, sub-flows) — v0.2. У MVP — тільки lightweight DAG (`flows[].steps[].depends_on`).
- Vision fallback integration — v0.3
- SDK-обгортки для React/Vue/Angular — v0.2 (MVP: vanilla JS + HTML attrs + universal middleware)
- Rate limiting / abuse prevention — v0.2
- Semantic versioning policy для Actions — v0.2 (CLI вже emit-ить diff, але без enforced policy)
- Cancel / abort API (Issue #6 з checkout validation) — v0.2
- Field-level validation events для complex form params (Issue #4 з checkout validation) — v0.2

---

## Відкриті питання (для наступної ітерації)

1. **Manifest caching**: ETag + `manifest.updated` event — достатньо, чи потрібен push-механізм через WebTransport?
2. **Scope naming convention**: хто визначає scope? Компонент сам? Глобальний реєстр? Чи treba namespace policy?
3. **JSON Logic evaluator**: який runtime закладемо? `json-logic-js` + Python equivalent для server-side агентів?
4. **WebMCP permission model**: як user grant-ить агенту доступ до сторінки? Per-origin? Per-action? Per-session?
5. **Action versioning**: `cart.add@v2` як частина ID? Чи окремий header? Як працює rollout breaking changes?
6. **Operational transform** для concurrent agents, що паралельно патчать state — поза scope MVP, потенційно для v0.3.
