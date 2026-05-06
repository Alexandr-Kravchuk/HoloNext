import type { AgentAction } from "./manifest-loader.js";
import type Anthropic from "@anthropic-ai/sdk";

// HoloNext Action.id has dots (`cart.add`), Anthropic tool names allow only [a-zA-Z0-9_-].
// We translate dots ↔ double-underscore for round-trip.
const DOT_REPLACEMENT = "__";

export const idToToolName = (id: string) => id.replaceAll(".", DOT_REPLACEMENT);
export const toolNameToId = (name: string) => name.replaceAll(DOT_REPLACEMENT, ".");

export function synthesizeTools(actions: AgentAction[]): Anthropic.Tool[] {
  return actions.map((a) => {
    const safetyHint = a.safety?.requires_human_input
      ? " [requires_human_input: agent must hand off to user]"
      : a.safety?.requires_confirmation
      ? " [requires_confirmation: stop and ask user]"
      : "";
    return {
      name: idToToolName(a.id),
      description: `${a.label}. ${a.description ?? ""}${safetyHint} (kind=${a.kind})`,
      input_schema: a.params as Anthropic.Tool.InputSchema,
    };
  });
}
