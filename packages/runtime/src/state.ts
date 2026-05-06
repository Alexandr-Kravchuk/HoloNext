import * as jsonpatch from "fast-json-patch";
import type { EventBus } from "./events.js";

export class StateStore {
  private current: Record<string, unknown>;

  constructor(initial: Record<string, unknown>, private bus: EventBus) {
    this.current = structuredClone(initial);
  }

  snapshot(): Readonly<Record<string, unknown>> {
    return structuredClone(this.current);
  }

  /**
   * Replace state and emit RFC 6902 patch event with the diff.
   * `mutator` receives a draft and may mutate it in place, or return a new value.
   */
  update(mutator: (draft: Record<string, unknown>) => Record<string, unknown> | void): void {
    const before = structuredClone(this.current);
    const draft = structuredClone(this.current);
    const next = mutator(draft) ?? draft;
    const patches = jsonpatch.compare(before, next);
    if (patches.length === 0) return;
    this.current = next;
    this.bus.emit({ type: "state.changed", patches });
  }
}
