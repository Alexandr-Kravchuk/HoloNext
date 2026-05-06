import { defineAction } from "@holonext/runtime";
import type { StateStore } from "@holonext/runtime";

const PRODUCTS = [
  { sku: "IPHONE-16-PRO", name: "iPhone 16 Pro", price: 1199 },
  { sku: "MBP-14-M4", name: 'MacBook Pro 14" M4', price: 1999 },
  { sku: "AIRPODS-PRO-2", name: "AirPods Pro 2", price: 249 },
];

const productBySku = new Map(PRODUCTS.map((p) => [p.sku, p]));

interface CartItem { sku: string; name: string; price: number; quantity: number }
interface CartState extends Record<string, unknown> {
  cart: { items: CartItem[]; total: number; item_count: number };
  catalog: typeof PRODUCTS;
}

export const initialState: CartState = {
  catalog: PRODUCTS,
  cart: { items: [], total: 0, item_count: 0 },
};

const recompute = (items: CartItem[]) => ({
  items,
  total: Number(items.reduce((s, i) => s + i.price * i.quantity, 0).toFixed(2)),
  item_count: items.reduce((s, i) => s + i.quantity, 0),
});

export const buildActions = (state: StateStore) => [
  defineAction({
    id: "cart.list",
    kind: "query",
    label: "List cart contents",
    description: "Returns current cart items, total, and item count.",
    params: { type: "object", properties: {} },
    returns: {
      type: "object",
      properties: {
        items: { type: "array", items: { type: "object" } },
        total: { type: "number" },
        item_count: { type: "integer" },
      },
    },
    safety: { idempotent: true, reversible: true },
    async perform() {
      return (state.snapshot().cart as CartState["cart"]);
    },
  }),

  defineAction({
    id: "catalog.list",
    kind: "query",
    label: "List available products",
    description: "Returns the product catalog (SKU, name, price).",
    params: { type: "object", properties: {} },
    returns: { type: "array", items: { type: "object" } },
    searchable_fields: ["name", "sku"],
    safety: { idempotent: true, reversible: true },
    async perform() {
      return PRODUCTS;
    },
  }),

  defineAction({
    id: "cart.add",
    kind: "mutation",
    label: "Add item to cart",
    description: "Adds a product (by SKU) to the cart with given quantity.",
    params: {
      type: "object",
      required: ["sku"],
      properties: {
        sku: { type: "string", description: "Product SKU" },
        quantity: { type: "integer", minimum: 1, default: 1 },
      },
    },
    safety: { idempotent: false, reversible: true, inverse_action: "cart.remove" },
    behavior: { long_running: false, estimated_duration_ms: 50, supports_partial: false },
    async perform(params: { sku: string; quantity?: number }) {
      const product = productBySku.get(params.sku);
      if (!product) {
        throw new Error(`Unknown SKU: ${params.sku}`);
      }
      const qty = params.quantity ?? 1;
      state.update((draft) => {
        const cart = draft.cart as CartState["cart"];
        const existing = cart.items.find((i) => i.sku === params.sku);
        const items = existing
          ? cart.items.map((i) => i.sku === params.sku ? { ...i, quantity: i.quantity + qty } : i)
          : [...cart.items, { sku: product.sku, name: product.name, price: product.price, quantity: qty }];
        draft.cart = recompute(items);
      });
      return state.snapshot().cart;
    },
  }),

  defineAction({
    id: "cart.remove",
    kind: "mutation",
    label: "Remove item from cart",
    description: "Removes a product (by SKU) entirely from the cart.",
    params: {
      type: "object",
      required: ["sku"],
      properties: { sku: { type: "string" } },
    },
    safety: { idempotent: true, reversible: true, inverse_action: "cart.add" },
    async perform(params: { sku: string }) {
      state.update((draft) => {
        const cart = draft.cart as CartState["cart"];
        draft.cart = recompute(cart.items.filter((i) => i.sku !== params.sku));
      });
      return state.snapshot().cart;
    },
  }),

  defineAction({
    id: "cart.clear",
    kind: "mutation",
    label: "Clear the cart",
    description: "Removes all items from the cart.",
    params: { type: "object", properties: {} },
    safety: { idempotent: true, reversible: false },
    async perform() {
      state.update((draft) => { draft.cart = recompute([]); });
      return state.snapshot().cart;
    },
  }),
];
