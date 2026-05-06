import type { ActionEvent } from "./types.js";

type Listener = (event: ActionEvent) => void;

export class EventBus {
  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  emit(event: ActionEvent): void {
    const enriched: ActionEvent = {
      ...event,
      timestamp: event.timestamp ?? new Date().toISOString(),
    };
    for (const l of this.listeners) {
      try {
        l(enriched);
      } catch (err) {
        console.error("[EventBus] listener error:", err);
      }
    }
  }
}
