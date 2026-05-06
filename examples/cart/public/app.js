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

// Subscribe to event stream — agent and UI share the same channel
const events = new EventSource("/api/agent/events");
events.addEventListener("state.changed", () => refreshCart());

loadCatalog();
refreshCart();
