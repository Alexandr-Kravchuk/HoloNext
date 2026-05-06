// HoloNext Agent Framework — runtime types (proto subset of MVP spec)

export type ActionKind = "mutation" | "query" | "human-delegated";

export interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
  default?: unknown;
  description?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  [k: string]: unknown;
}

export interface SafetyAnnotations {
  idempotent?: boolean;
  reversible?: boolean;
  requires_confirmation?: boolean;
  sensitive_data?: boolean;
  inverse_action?: string;
  requires_human_input?: boolean;
  human_input_reason?: string;
  human_input_target?: string;
}

export interface BehaviorAnnotations {
  long_running?: boolean;
  estimated_duration_ms?: number;
  supports_partial?: boolean;
}

export interface ActionDefinition<TParams = unknown, TResult = unknown> {
  id: string;
  kind: ActionKind;
  label: string;
  description?: string;
  params: JsonSchema;
  returns?: JsonSchema;            // обов'язково для kind: "query"
  safety?: SafetyAnnotations;
  behavior?: BehaviorAnnotations;
  preconditions?: unknown;          // JSON Logic (proto: stored, not evaluated)
  searchable_fields?: string[];
  sortable_fields?: string[];
  freshness?: { policy: "live" | "cached" | "snapshot"; cache_ttl_seconds?: number };
  perform: (params: TParams, ctx: ActionContext) => Promise<TResult>;
}

export interface ActionContext {
  invocation_id: string;
  state: Readonly<Record<string, unknown>>;
  emit: (event: ActionEvent) => void;
}

export type ActionEventType =
  | "action.started"
  | "action.progress"
  | "action.succeeded"
  | "action.partially_succeeded"
  | "action.failed"
  | "action.requires_confirmation"
  | "action.awaiting_human"
  | "state.changed"
  | "page.navigated"
  | "flow.step_changed"
  | "manifest.updated";

export interface ActionEvent {
  type: ActionEventType;
  timestamp?: string;
  action_id?: string;
  invocation_id?: string;
  [k: string]: unknown;
}

export interface Manifest {
  $schema: string;
  version: string;
  page: { url: string; title: string; context?: string };
  actions: Array<Omit<ActionDefinition, "perform">>;
  state: Record<string, unknown>;
  events_endpoint: string;
}
