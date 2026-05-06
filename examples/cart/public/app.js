// Vanilla JS UI — uses the same agent endpoints as an AI agent would.
const productsEl = document.getElementById("products");
const cartEl = document.getElementById("cart");

async function callAction(id, params = {}) {
  const res = await fetch(`/api/agent/actions/${id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  return res.json();
}

async function loadCatalog() {
  const { result } = await callAction("catalog.list");
  productsEl.innerHTML = result.map((p) => `
    <div class="product">
      <h3>${p.name}</h3>
      <div class="price">$${p.price}</div>
      <div style="margin-top:0.5rem;">
        <button data-add="${p.sku}">Add to cart</button>
      </div>
    </div>
  `).join("");
}

async function refreshCart() {
  const { result } = await callAction("cart.list");
  if (result.items.length === 0) {
    cartEl.innerHTML = "<em>Cart is empty</em>";
    return;
  }
  cartEl.innerHTML = result.items.map((i) => `
    <div class="cart-item">
      <span>${i.name} × ${i.quantity}</span>
      <span>
        $${(i.price * i.quantity).toFixed(2)}
        <button class="secondary" data-remove="${i.sku}" style="margin-left:0.5rem;">×</button>
      </span>
    </div>
  `).join("") + `
    <div class="total">Total: $${result.total.toFixed(2)} (${result.item_count} items)</div>
    <button class="secondary" data-clear>Clear</button>
  `;
}

document.addEventListener("click", async (e) => {
  const t = e.target;
  if (t.dataset.add) { await callAction("cart.add", { sku: t.dataset.add }); refreshCart(); }
  if (t.dataset.remove) { await callAction("cart.remove", { sku: t.dataset.remove }); refreshCart(); }
  if (t.dataset.clear !== undefined) { await callAction("cart.clear"); refreshCart(); }
});

// Activity log — render every event for visibility during stress tests
const activityEl = document.getElementById("activity");
let activityHasContent = false;
function logEvent(label, data) {
  if (!activityHasContent) { activityEl.innerHTML = ""; activityHasContent = true; }
  const row = document.createElement("div");
  const t = new Date().toLocaleTimeString();
  row.textContent = `[${t}] ${label} ${data ? JSON.stringify(data) : ""}`;
  activityEl.prepend(row);
}

// Subscribe to event stream — agent and UI share the same channel
const events = new EventSource("/api/agent/events");
events.addEventListener("state.changed", (e) => { refreshCart(); logEvent("state.changed", JSON.parse(e.data).patches); });
events.addEventListener("action.started", (e) => logEvent("action.started", { id: JSON.parse(e.data).action_id }));
events.addEventListener("action.progress", (e) => {
  const d = JSON.parse(e.data);
  logEvent(`action.progress ${d.percent}%`, { stage: d.stage, message: d.message });
});
events.addEventListener("action.succeeded", (e) => logEvent("action.succeeded", { id: JSON.parse(e.data).action_id, result: JSON.parse(e.data).result }));
events.addEventListener("action.partially_succeeded", (e) => {
  const d = JSON.parse(e.data);
  logEvent("action.partially_succeeded", { summary: d.summary, failed: d.failed_items });
});
events.addEventListener("action.failed", (e) => logEvent("action.failed", JSON.parse(e.data).error));

loadCatalog();
refreshCart();
